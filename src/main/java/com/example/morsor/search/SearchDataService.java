package com.example.morsor.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.apache.lucene.index.Term;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.FuzzyQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermInSetQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.apache.lucene.store.Directory;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.index.IndexableField;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import jakarta.annotation.PostConstruct;
import org.apache.lucene.queryparser.classic.ParseException;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.HashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import org.apache.lucene.util.BytesRef;

@Service
public class SearchDataService {

    /** Trove JSON files (set in properties / MOOCHO_DATA_LOCATION). */
    @Value("${moocho.data.location}")
    private String dataLocation;

    private static final String TROVES_LIST_KEY = "troves";

    private static final Logger log = LoggerFactory.getLogger(SearchDataService.class);

    private final ResourcePatternResolver resourceResolver;
    private final ObjectMapper objectMapper;

    @Value("${moocho.bucket.name:}")
    private String bucketName;

    @Value("${moocho.only.trove.ids:}")
    private String onlyTroveIds;

    private final Environment environment;

    private List<SearchResult> allResults = List.of();
    private Directory luceneDirectory;
    private IndexSearcher luceneSearcher;
    private final AccentInsensitiveAnalyzer luceneAnalyzer = new AccentInsensitiveAnalyzer();

    public SearchDataService(ResourcePatternResolver resourceResolver, ObjectMapper objectMapper,
            Environment environment) {
        this.resourceResolver = resourceResolver;
        this.objectMapper = objectMapper;
        this.environment = environment;
        log.info("SearchDataService created; active profiles: {}", Arrays.toString(environment.getActiveProfiles()));
    }

    @PostConstruct
    void loadData() {
        log.info("SearchDataService.loadData() started");
        Set<String> onlyIds = parseOnlyTroveIds(onlyTroveIds);
        if (!onlyIds.isEmpty()) {
            log.info("Loading only trove IDs: {}", onlyIds);
        }
        List<SearchResult> combined = new ArrayList<>();
        boolean useS3 = environment.acceptsProfiles(Profiles.of("s3troves"));
        log.info("Trove load: useS3={}, bucketName={}", useS3, bucketName != null ? bucketName : "(null)");
        if (useS3) {
            requireS3EnvVars();
            loadFromS3(combined, onlyIds);
        } else {
            loadFromClasspath(combined, onlyIds);
        }
        allResults = combined;
        buildLuceneIndex();
        log.info("SearchDataService.loadData() finished: {} results, {} trove options", allResults.size(), getTroveOptions().size());
    }

    /** When s3troves profile is active, fail fast if any required env var is missing. */
    private void requireS3EnvVars() {
        List<String> missing = new ArrayList<>();
        if (bucketName == null || bucketName.isBlank()) {
            missing.add("MOOCHO_BUCKET_NAME");
        }
        if (blank(environment.getProperty("AWS_ACCESS_KEY_ID"))) {
            missing.add("AWS_ACCESS_KEY_ID");
        }
        if (blank(environment.getProperty("AWS_SECRET_ACCESS_KEY"))) {
            missing.add("AWS_SECRET_ACCESS_KEY");
        }
        if (blank(environment.getProperty("AWS_REGION"))) {
            missing.add("AWS_REGION");
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException(
                "s3troves profile is active but required environment variables are not set: " + missing
                + ". Set them before starting the application.");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private void buildLuceneIndex() {
        if (allResults.isEmpty()) {
            log.info("Lucene index skipped: no data");
            return;
        }
        try {
            Directory dir = new ByteBuffersDirectory();
            IndexWriterConfig config = new IndexWriterConfig(luceneAnalyzer);
            config.setOpenMode(IndexWriterConfig.OpenMode.CREATE);
            try (IndexWriter writer = new IndexWriter(dir, config)) {
                final String contentField = "content";
                final String troveIdField = "troveId";
                final String idxField = "idx";
                for (int i = 0; i < allResults.size(); i++) {
                    SearchResult r = allResults.get(i);
                    Document doc = new Document();
                    String title = r.title() != null ? r.title() : "";
                    String snippet = r.snippet() != null ? r.snippet() : "";
                    doc.add(new TextField(contentField, title + " " + snippet, Field.Store.NO));
                    doc.add(new StringField(troveIdField, r.troveId() != null ? r.troveId() : "", Field.Store.NO));
                    doc.add(new StoredField(idxField, i));
                    writer.addDocument(doc);
                }
                writer.commit();
            }
            luceneDirectory = dir;
            luceneSearcher = new IndexSearcher(DirectoryReader.open(luceneDirectory));
            log.info("Lucene index built: {} documents", allResults.size());
        } catch (IOException e) {
            log.error("Failed to build Lucene index: {}", e.getMessage(), e);
        }
    }

    private static Set<String> parseOnlyTroveIds(String value) {
        if (value == null || value.isBlank()) return Set.of();
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    private void loadFromS3(List<SearchResult> combined, Set<String> onlyIds) {
        log.info("Loading from S3");
        // Region from AWS_REGION env var (e.g. us-west-2); fallback for local runs without it set
        String region = System.getenv().getOrDefault("AWS_REGION", "us-west-2");
        try (S3Client s3 = S3Client.builder()
                .region(Region.of(region))
                .build()) {
            String trovesContent;
            try (ResponseInputStream<GetObjectResponse> stream = s3.getObject(
                    GetObjectRequest.builder().bucket(bucketName).key(TROVES_LIST_KEY).build())) {
                trovesContent = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
            JsonNode root = objectMapper.readTree(trovesContent);
            List<JsonNode> troveEntries;
            if (root.has("troves") && root.get("troves").isArray()) {
                troveEntries = StreamSupport.stream(root.get("troves").spliterator(), false).toList();
            } else if (root.isArray()) {
                troveEntries = StreamSupport.stream(root.spliterator(), false).toList();
            } else {
                troveEntries = List.of(root);
            }
            log.info("Troves manifest: {} entries", troveEntries.size());
            if (troveEntries.isEmpty()) {
                log.warn("Troves manifest is empty; no data will be loaded");
            }
            List<TroveS3Key> toLoad = new ArrayList<>();
            for (JsonNode entry : troveEntries) {
                String troveId = textOrNull(entry, "id");
                if (troveId == null || troveId.isEmpty()) {
                    troveId = textOrNull(entry, "troveId");
                }
                if (troveId == null || troveId.isEmpty()) {
                    troveId = textOrNull(entry, "trove_id");
                }
                String bucketPrefix = textOrNull(entry, "bucketPrefix");
                if (bucketPrefix != null) bucketPrefix = bucketPrefix.trim();
                else bucketPrefix = "";
                if (troveId == null || troveId.isEmpty()) {
                    log.warn("Skipping trove entry with no id (tried id, troveId, trove_id); entry: {}", entry);
                    continue;
                }
                if (!onlyIds.isEmpty() && !onlyIds.contains(troveId)) {
                    log.debug("Skipping trove \"{}\" (not in moocho.only.trove.ids)", troveId);
                    continue;
                }
                String key = bucketPrefix.isEmpty() ? troveId + ".json" : bucketPrefix + "/" + troveId + ".json";
                toLoad.add(new TroveS3Key(troveId, key));
            }
            List<SearchResult> loaded = toLoad.parallelStream()
                    .flatMap(tk -> {
                        log.info("Fetching trove from S3: key={}", tk.key);
                        try (InputStream in = s3.getObject(GetObjectRequest.builder()
                                .bucket(bucketName)
                                .key(tk.key)
                                .build())) {
                            JsonNode root2 = objectMapper.readTree(in);
                            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root2);
                            log.info("Loaded trove \"{}\": {} records", tk.troveId, results.size());
                            return results.stream();
                        } catch (Exception e) {
                            log.error("Failed to load trove \"{}\" from S3 (key={}): {}", tk.troveId, tk.key, e.getMessage(), e);
                            return Stream.<SearchResult>empty();
                        }
                    })
                    .toList();
            combined.addAll(loaded);
            log.info("Trove load from S3 complete: {} total records", combined.size());
        } catch (Exception e) {
            log.error("Failed to load troves list from S3 (bucket={}): {}", bucketName, e.getMessage(), e);
        }
    }

    private void loadFromClasspath(List<SearchResult> combined, Set<String> onlyIds) {
        log.info("Loading trove data from: {}", dataLocation);
        try {
            Resource[] resources = resourceResolver.getResources(dataLocation);
            log.info("Trove data resources found: {}", resources.length);
            Arrays.sort(resources, (a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                    a.getFilename() != null ? a.getFilename() : "",
                    b.getFilename() != null ? b.getFilename() : ""));
            for (Resource resource : resources) {
                try (InputStream in = resource.getInputStream()) {
                    JsonNode root = objectMapper.readTree(in);
                    String troveId = root.has("id") && root.get("id").isTextual()
                            ? root.get("id").asText()
                            : (resource.getFilename() != null ? resource.getFilename() : "unknown");
                    if (!onlyIds.isEmpty() && !onlyIds.contains(troveId)) {
                        log.debug("Skipping trove \"{}\" (not in moocho.only.trove.ids)", troveId);
                        continue;
                    }
                    List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
                    log.info("Loaded trove \"{}\": {} records", troveId, results.size());
                    combined.addAll(results);
                } catch (Exception e) {
                    log.error("Failed to load trove from {}: {}", resource.getDescription(), e.getMessage(), e);
                }
            }
        } catch (Exception e) {
            log.error("Failed to resolve trove data from {}: {}", dataLocation, e.getMessage(), e);
        }
    }

    public List<SearchResult> search(List<String> troveIds, String query) {
        Set<String> troveIdSet = troveIds == null ? Set.of() : troveIds.stream()
                .map(t -> t == null ? null : t.trim())
                .filter(t -> t != null && !t.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        String queryTrimmed = query == null ? "" : query.trim();
        boolean matchAll = "*".equals(queryTrimmed);
        boolean noTextQuery = queryTrimmed.isEmpty() || matchAll;

        if (noTextQuery) {
            Stream<SearchResult> stream = allResults.stream();
            if (!troveIdSet.isEmpty()) {
                stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
            }
            return stream.toList();
        }

        if (luceneSearcher == null) {
            return searchFallback(troveIdSet, queryTrimmed);
        }
        try {
            BooleanQuery.Builder bq = new BooleanQuery.Builder();
            if (!troveIdSet.isEmpty()) {
                List<BytesRef> terms = troveIdSet.stream().map(BytesRef::new).toList();
                bq.add(new TermInSetQuery("troveId", terms), BooleanClause.Occur.FILTER);
            }
            Query textQuery = buildFuzzyQuery(queryTrimmed);
            if (textQuery == null) {
                QueryParser parser = new QueryParser(CONTENT_FIELD, luceneAnalyzer);
                parser.setDefaultOperator(QueryParser.Operator.AND);
                textQuery = parser.parse(QueryParser.escape(queryTrimmed));
            }
            bq.add(textQuery, BooleanClause.Occur.MUST);
            TopDocs topDocs = luceneSearcher.search(bq.build(), allResults.size());
            List<SearchResult> out = new ArrayList<>(topDocs.scoreDocs.length);
            StoredFields storedFields = luceneSearcher.storedFields();
            for (ScoreDoc sd : topDocs.scoreDocs) {
                Document hitDoc = storedFields.document(sd.doc);
                IndexableField idxField = hitDoc.getField("idx");
                if (idxField != null && idxField.numericValue() != null) {
                    int idx = idxField.numericValue().intValue();
                    if (idx >= 0 && idx < allResults.size()) {
                        out.add(allResults.get(idx));
                    }
                }
            }
            return out;
        } catch (ParseException e) {
            log.debug("Lucene parse failed for query \"{}\", falling back to substring match: {}", queryTrimmed, e.getMessage());
            return searchFallback(troveIdSet, queryTrimmed);
        } catch (IOException e) {
            log.warn("Lucene search failed: {}, falling back to substring match", e.getMessage());
            return searchFallback(troveIdSet, queryTrimmed);
        }
    }

    private static final String CONTENT_FIELD = "content";
    private static final int FUZZY_MAX_EDITS = 2;
    private static final int FUZZY_PREFIX_LENGTH = 1;

    /**
     * Build a query that matches each token from the user query with typo tolerance (fuzzy match)
     * against indexed terms. Returns null if tokenization yields no terms (caller may use QueryParser).
     */
    private Query buildFuzzyQuery(String queryTrimmed) throws IOException {
        List<String> terms = tokenizeQuery(queryTrimmed);
        if (terms.isEmpty()) return null;
        BooleanQuery.Builder bq = new BooleanQuery.Builder();
        for (String term : terms) {
            if (term.isEmpty()) continue;
            int maxEdits = term.length() <= 3 ? 1 : FUZZY_MAX_EDITS;
            FuzzyQuery fq = new FuzzyQuery(new Term(CONTENT_FIELD, term), maxEdits, FUZZY_PREFIX_LENGTH);
            bq.add(fq, BooleanClause.Occur.MUST);
        }
        return bq.build();
    }

    private List<String> tokenizeQuery(String text) throws IOException {
        List<String> terms = new ArrayList<>();
        try (TokenStream ts = luceneAnalyzer.tokenStream(CONTENT_FIELD, new StringReader(text))) {
            CharTermAttribute termAtt = ts.addAttribute(CharTermAttribute.class);
            ts.reset();
            while (ts.incrementToken()) {
                String t = termAtt.toString();
                if (t != null && !t.isEmpty()) terms.add(t);
            }
            ts.end();
        }
        return terms;
    }

    private List<SearchResult> searchFallback(Set<String> troveIdSet, String queryTrimmed) {
        String queryLower = queryTrimmed.toLowerCase();
        Stream<SearchResult> stream = allResults.stream();
        if (!troveIdSet.isEmpty()) {
            stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
        }
        stream = stream.filter(r ->
                (r.title() != null && r.title().toLowerCase().contains(queryLower))
                        || (r.snippet() != null && r.snippet().toLowerCase().contains(queryLower)));
        return stream.toList();
    }

    /**
     * Find duplicate/near-duplicate items: for each item in the primary trove (matching query),
     * find similar items in the compare troves by Lucene similarity (query = primary item content).
     */
    public List<DuplicateMatchRow> searchDuplicates(String primaryTroveId, Set<String> compareTroveIds,
                                                     String query, int maxMatchesPerPrimary) {
        if (primaryTroveId == null || primaryTroveId.isBlank()) return List.of();
        Set<String> compareSet = compareTroveIds == null ? Set.of() : compareTroveIds.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (compareSet.isEmpty()) return List.of();

        List<SearchResult> primaryItems = search(List.of(primaryTroveId), query != null ? query.trim() : "");
        if (primaryItems.isEmpty()) return List.of();

        int maxMatch = Math.max(1, Math.min(maxMatchesPerPrimary, 50));
        List<DuplicateMatchRow> rows = new ArrayList<>(primaryItems.size());
        for (SearchResult primary : primaryItems) {
            List<ScoredSearchResult> matches = findSimilarInTroves(primary, compareSet, maxMatch);
            matches = filterMatchesByYearHeuristic(primary, matches);
            matches = matches.stream().limit(5).toList();
            if (!matches.isEmpty()) {
                rows.add(new DuplicateMatchRow(primary, matches));
            }
        }
        List<DuplicateMatchRow> deduped = deduplicateDuplicateRowsByGroup(rows);
        deduped.sort((a, b) -> Double.compare(maxMatchScore(b), maxMatchScore(a)));
        return deduped;
    }

    private static double maxMatchScore(DuplicateMatchRow row) {
        if (row.matches() == null || row.matches().isEmpty()) return 0.0;
        return row.matches().stream().mapToDouble(ScoredSearchResult::score).max().orElse(0.0);
    }

    /**
     * When the same trove is in both primary and compare, each pair (A,B) appears as both
     * (A primary, B match) and (B primary, A match). Keep one row per duplicate group by
     * canonicalizing on the set of item ids and retaining the row whose primary has the
     * smallest id in the group.
     */
    private List<DuplicateMatchRow> deduplicateDuplicateRowsByGroup(List<DuplicateMatchRow> rows) {
        Map<String, DuplicateMatchRow> byGroup = new HashMap<>();
        for (DuplicateMatchRow row : rows) {
            TreeSet<String> group = new TreeSet<>();
            if (row.primary() != null && row.primary().id() != null) group.add(row.primary().id());
            for (ScoredSearchResult m : row.matches() != null ? row.matches() : List.<ScoredSearchResult>of()) {
                if (m.result() != null && m.result().id() != null) group.add(m.result().id());
            }
            if (group.isEmpty()) continue;
            String groupKey = String.join(",", group);
            String minId = group.iterator().next();
            if (!byGroup.containsKey(groupKey) || (row.primary() != null && minId.equals(row.primary().id()))) {
                byGroup.put(groupKey, row);
            }
        }
        return new ArrayList<>(byGroup.values());
    }

    /**
     * Find items in the primary trove that have no match in the compare troves (converse of duplicates).
     * Uses the same similarity and year heuristic as searchDuplicates; returns primary items with zero matches.
     * Results are ranked by uniqueness: ascending "nearest miss" score (lowest score = most unique first).
     * The nearest miss is the best similarity score among compare-trove items that were rejected by the year heuristic.
     */
    public List<UniqueResult> searchUniques(String primaryTroveId, Set<String> compareTroveIds, String query) {
        if (primaryTroveId == null || primaryTroveId.isBlank()) return List.of();
        Set<String> compareSet = compareTroveIds == null ? Set.of() : compareTroveIds.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (compareSet.isEmpty()) return List.of();

        List<SearchResult> primaryItems = search(List.of(primaryTroveId), query != null ? query.trim() : "");
        if (primaryItems.isEmpty()) return List.of();

        List<UniqueResult> uniquesWithScore = new ArrayList<>(primaryItems.size());
        for (SearchResult primary : primaryItems) {
            List<ScoredSearchResult> rawMatches = findSimilarInTroves(primary, compareSet, 50);
            List<ScoredSearchResult> filtered = filterMatchesByYearHeuristic(primary, rawMatches);
            if (filtered.isEmpty()) {
                double nearestMiss = rawMatches.isEmpty() ? 0.0
                        : rawMatches.stream().mapToDouble(ScoredSearchResult::score).max().orElse(0.0);
                TitleWithYear primaryParsed = parseTitleWithYear(primary.title() != null ? primary.title() : "");
                List<ScoredSearchResult> topNearMisses = rawMatches.stream()
                        .sorted(java.util.Comparator.comparingDouble(ScoredSearchResult::score).reversed())
                        .filter(m -> !isYearOnlyMatch(primaryParsed, m.result().title() != null ? m.result().title() : ""))
                        .limit(5)
                        .toList();
                uniquesWithScore.add(new UniqueResult(primary, nearestMiss, topNearMisses));
            }
        }
        uniquesWithScore.sort(java.util.Comparator.comparingDouble(UniqueResult::score));
        return uniquesWithScore;
    }

    /**
     * Heuristic: if a title ends with (YYYY), the year alone does not make a match.
     * - Both have years and they differ → reject.
     * - Primary has year: candidate core text must match primary core (one contains the other or equal).
     * - Primary has no year: no extra filter.
     */
    private List<ScoredSearchResult> filterMatchesByYearHeuristic(SearchResult primary, List<ScoredSearchResult> matches) {
        TitleWithYear primaryParsed = parseTitleWithYear(primary.title() != null ? primary.title() : "");
        return matches.stream()
                .filter(m -> passesYearHeuristic(primaryParsed, m.result().title() != null ? m.result().title() : ""))
                .toList();
    }

    private static final Pattern YEAR_SUFFIX = Pattern.compile("\\s*\\((\\d{4})\\)\\s*$");

    private record TitleWithYear(String core, Integer year) {}

    private static TitleWithYear parseTitleWithYear(String title) {
        if (title == null || title.isBlank()) return new TitleWithYear("", null);
        java.util.regex.Matcher m = YEAR_SUFFIX.matcher(title);
        if (m.find()) {
            String core = title.substring(0, m.start()).trim();
            int y = Integer.parseInt(m.group(1));
            return new TitleWithYear(core, y);
        }
        return new TitleWithYear(title.trim(), null);
    }

    private static boolean passesYearHeuristic(TitleWithYear primary, String candidateTitle) {
        TitleWithYear candidate = parseTitleWithYear(candidateTitle);
        if (primary.year != null && candidate.year != null && !primary.year.equals(candidate.year)) {
            return false;
        }
        if (primary.year != null) {
            return coreTextMatch(primary.core, candidate.core);
        }
        return true;
    }

    /** True if candidate matches only on year (same year, core text does not match). Exclude from near-miss UI. */
    private static boolean isYearOnlyMatch(TitleWithYear primary, String candidateTitle) {
        TitleWithYear candidate = parseTitleWithYear(candidateTitle);
        if (primary.year == null || candidate.year == null || !primary.year.equals(candidate.year)) {
            return false;
        }
        return !coreTextMatch(primary.core, candidate.core);
    }

    private static boolean coreTextMatch(String a, String b) {
        String na = normalizeForComparison(a != null ? a : "");
        String nb = normalizeForComparison(b != null ? b : "");
        if (na.isEmpty() || nb.isEmpty()) return false;
        return na.equals(nb) || nb.contains(na) || na.contains(nb);
    }

    /** Lowercase, strip accents, and normalize punctuation so "Léon" vs "Leon" and "2001-" vs "2001:" compare equal. */
    private static String normalizeForComparison(String s) {
        if (s == null) return "";
        String t = s.trim();
        if (t.isEmpty()) return "";
        String nfd = Normalizer.normalize(t, Normalizer.Form.NFD);
        String noAccents = nfd.replaceAll("\\p{M}", "");
        String noPunct = noAccents.replaceAll("\\p{P}", " ");
        String collapsed = noPunct.replaceAll("\\s+", " ").trim();
        return collapsed.toLowerCase();
    }

    /** Search for items similar to the given item, restricted to the given trove IDs. Returns top N by score. */
    private List<ScoredSearchResult> findSimilarInTroves(SearchResult similarTo, Set<String> troveIds, int topN) {
        String content = (similarTo.title() != null ? similarTo.title() : "") + " "
                + (similarTo.snippet() != null ? similarTo.snippet() : "");
        String queryStr = content.trim();
        if (queryStr.isEmpty()) return List.of();
        if (luceneSearcher == null) return List.of();

        try {
            BooleanQuery.Builder bq = new BooleanQuery.Builder();
            List<BytesRef> terms = troveIds.stream().map(BytesRef::new).toList();
            bq.add(new TermInSetQuery("troveId", terms), BooleanClause.Occur.FILTER);
            QueryParser parser = new QueryParser("content", luceneAnalyzer);
            parser.setDefaultOperator(QueryParser.Operator.OR);
            Query textQuery = parser.parse(QueryParser.escape(queryStr));
            bq.add(textQuery, BooleanClause.Occur.MUST);
            TopDocs topDocs = luceneSearcher.search(bq.build(), topN);
            List<ScoredSearchResult> out = new ArrayList<>(topDocs.scoreDocs.length);
            StoredFields storedFields = luceneSearcher.storedFields();
            for (ScoreDoc sd : topDocs.scoreDocs) {
                Document hitDoc = storedFields.document(sd.doc);
                IndexableField idxField = hitDoc.getField("idx");
                if (idxField != null && idxField.numericValue() != null) {
                    int idx = idxField.numericValue().intValue();
                    if (idx >= 0 && idx < allResults.size()) {
                        SearchResult r = allResults.get(idx);
                        if (Objects.equals(r.id(), similarTo.id())) continue;
                        out.add(new ScoredSearchResult(r, sd.score));
                    }
                }
            }
            return out;
        } catch (ParseException | IOException e) {
            log.debug("Similar search failed for primary \"{}\": {}", similarTo.title(), e.getMessage());
            return List.of();
        }
    }

    public List<TroveOption> getTroveOptions() {
        return allResults.stream()
                .filter(r -> r.troveId() != null && !r.troveId().isBlank())
                .collect(Collectors.groupingBy(SearchResult::troveId))
                .entrySet().stream()
                .map(e -> {
                    String id = e.getKey();
                    List<SearchResult> items = e.getValue();
                    String name = items.isEmpty() ? id : (items.get(0).trove() != null ? items.get(0).trove() : id);
                    return new TroveOption(id, name, items.size());
                })
                .sorted(java.util.Comparator.comparing(TroveOption::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private static String textOrNull(JsonNode node, String field) {
        if (node == null || !node.has(field)) return null;
        JsonNode v = node.get(field);
        return (v != null && v.isTextual()) ? v.asText() : null;
    }

    private record TroveS3Key(String troveId, String key) {}
}

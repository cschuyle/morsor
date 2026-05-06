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
import org.apache.lucene.index.Term;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.BoostQuery;
import org.apache.lucene.search.FuzzyQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermInSetQuery;
import org.apache.lucene.search.TermQuery;
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
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;
import java.util.regex.Pattern;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import org.apache.lucene.util.BytesRef;

@Service
public class SearchDataService {

    /** Trove JSON files (set in properties / MOOCHO_DATA_LOCATION). */
    @Value("${moocho.data.location}")
    private String dataLocation;

    private static final String TROVES_LIST_KEY = "troves.json";

    private static final Logger log = LoggerFactory.getLogger(SearchDataService.class);

    private final ResourcePatternResolver resourceResolver;
    private final ObjectMapper objectMapper;

    @Value("${moocho.bucket.name:}")
    private String bucketName;

    @Value("${moocho.only.trove.ids:}")
    private String onlyTroveIds;

    @Value("${moocho.exclude.trove.ids:}")
    private String excludeTroveIds;

    private final Environment environment;

    private List<SearchResult> allResults = List.of();
    /** Last successful reload payload (before ephemeral merge). */
    private List<SearchResult> persistedResults = List.of();
    private final Map<String, List<SearchResult>> ephemeralTroves = new ConcurrentHashMap<>();
    private final Set<String> cliCreatedEphemeralTroveIds = ConcurrentHashMap.newKeySet();
    private final Object mergeLock = new Object();
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
        reloadData();
    }

    /** Reload troves and search index from configured source (file or S3). Call after startup to refresh data. */
    public void reloadData() {
        reloadData(null, null);
    }

    /**
     * Reload troves with optional progress callback. Progress is (current, total) where total is the number of
     * troves to load; total may be 0 when unknown (e.g. some deployments). When total is known (e.g. classpath
     * or S3 manifest, or postgres profile with a count), the UI can show percentage completion.
     * If cancelled is set (e.g. client disconnected), the loaded data is not applied and existing data is left unchanged.
     */
    public void reloadData(BiConsumer<Integer, Integer> progress, AtomicBoolean cancelled) {
        log.info("SearchDataService.reloadData() started");
        Set<String> onlyIds = parseTroveIds(onlyTroveIds);
        Set<String> excludeIds = parseTroveIds(excludeTroveIds);
        Set<String> loadedTroveIds = java.util.Collections.synchronizedSet(new TreeSet<>());
        List<String> loadErrors = java.util.Collections.synchronizedList(new ArrayList<>());
        if (!onlyIds.isEmpty()) {
            log.info("Loading only trove IDs: {}", onlyIds);
        }
        if (!excludeIds.isEmpty()) {
            log.info("Excluding trove IDs: {}", excludeIds);
        }
        List<SearchResult> combined = new ArrayList<>();
        boolean useS3 = environment.acceptsProfiles(Profiles.of("s3troves"));
        log.info("Trove load: useS3={}, bucketName={}", useS3, bucketName != null ? bucketName : "(null)");
        if (useS3) {
            requireS3EnvVars();
            loadFromS3(combined, onlyIds, excludeIds, progress, loadedTroveIds, loadErrors);
        } else {
            loadFromClasspath(combined, onlyIds, excludeIds, progress, loadedTroveIds, loadErrors);
        }
        if (cancelled != null && cancelled.get()) {
            log.info("Reload cancelled (client disconnected); existing data unchanged");
            return;
        }
        Map<String, Long> loadedItemCountsByTrove = combined.stream()
                .filter(r -> r.troveId() != null && !r.troveId().isBlank())
                .collect(Collectors.groupingBy(SearchResult::troveId, Collectors.counting()));
        List<String> loadedTroveSummaries = loadedTroveIds.stream()
                .sorted((a, b) -> {
                    long ca = loadedItemCountsByTrove.getOrDefault(a, 0L);
                    long cb = loadedItemCountsByTrove.getOrDefault(b, 0L);
                    int byCount = Long.compare(cb, ca);
                    if (byCount != 0) {
                        return byCount;
                    }
                    return String.CASE_INSENSITIVE_ORDER.compare(a, b);
                })
                .map(id -> id + "(" + loadedItemCountsByTrove.getOrDefault(id, 0L) + ")")
                .toList();
        log.info("Trove load complete. Loaded trove IDs with item counts ({}): {}", loadedTroveSummaries.size(), loadedTroveSummaries);
        if (!loadErrors.isEmpty()) {
            log.warn("Trove load completed with {} errors: {}", loadErrors.size(), loadErrors);
        }
        synchronized (mergeLock) {
            persistedResults = List.copyOf(combined);
            rebuildMergedIndexLocked();
        }
        log.info("SearchDataService.reloadData() finished: {} results, {} trove options", allResults.size(), getTroveOptions().size());
    }

    /** Max items per ephemeral trove registration (CLI upload). */
    public static final int MAX_EPHEMERAL_ITEMS_PER_TROVE = 50_000;

    /** Enough for typical absolute paths (e.g. full directory path as trove display name). */
    private static final int MAX_EPHEMERAL_DISPLAY_NAME_LEN = 8192;

    /**
     * Register an in-memory trove from uploaded items. Trove id is always {@code local-}{@link UUID}.
     * Rebuilds the merged Lucene index; not persisted across restart.
     *
     * @param displayName required non-blank trove label (CLI sends the scanned directory's full path)
     */
    public EphemeralTroveRegistration registerEphemeralTrove(String displayName, List<EphemeralManifestItem> items, boolean cliCreated) {
        if (items == null) {
            throw new IllegalArgumentException("items must not be null");
        }
        if (items.size() > MAX_EPHEMERAL_ITEMS_PER_TROVE) {
            throw new IllegalArgumentException("items size exceeds limit " + MAX_EPHEMERAL_ITEMS_PER_TROVE);
        }
        String troveLabel = displayName == null ? "" : displayName.trim();
        if (troveLabel.isEmpty()) {
            throw new IllegalArgumentException("displayName is required");
        }
        if (troveLabel.length() > MAX_EPHEMERAL_DISPLAY_NAME_LEN) {
            throw new IllegalArgumentException("displayName exceeds max length " + MAX_EPHEMERAL_DISPLAY_NAME_LEN);
        }
        String troveId = "local-" + UUID.randomUUID();
        List<SearchResult> stamped = new ArrayList<>(items.size());
        for (EphemeralManifestItem item : items) {
            if ((item.title() == null || item.title().isBlank())
                    && (item.id() == null || item.id().isBlank())) {
                throw new IllegalArgumentException("each item must have a non-blank id or title");
            }
            stamped.add(ephemeralItemToSearchResult(item, troveId, troveLabel));
        }
        synchronized (mergeLock) {
            ephemeralTroves.put(troveId, List.copyOf(stamped));
            if (cliCreated) {
                cliCreatedEphemeralTroveIds.add(troveId);
            } else {
                cliCreatedEphemeralTroveIds.remove(troveId);
            }
            rebuildMergedIndexLocked();
        }
        log.info("Registered ephemeral trove id=\"{}\" name=\"{}\" ({} items)", troveId, troveLabel, stamped.size());
        return new EphemeralTroveRegistration(troveId, troveLabel, stamped.size());
    }

    /** Remove an ephemeral trove by id. Returns true if it existed. */
    public boolean removeEphemeralTrove(String troveId) {
        if (troveId == null || troveId.isBlank()) {
            return false;
        }
        synchronized (mergeLock) {
            List<SearchResult> removed = ephemeralTroves.remove(troveId.trim());
            if (removed == null) {
                return false;
            }
            cliCreatedEphemeralTroveIds.remove(troveId.trim());
            rebuildMergedIndexLocked();
        }
        log.info("Removed ephemeral trove \"{}\"", troveId);
        return true;
    }

    private void rebuildMergedIndexLocked() {
        int extra = 0;
        for (List<SearchResult> list : ephemeralTroves.values()) {
            extra += list.size();
        }
        List<SearchResult> merged = new ArrayList<>(persistedResults.size() + extra);
        merged.addAll(persistedResults);
        for (List<SearchResult> list : ephemeralTroves.values()) {
            merged.addAll(list);
        }
        allResults = List.copyOf(merged);
        buildLuceneIndex(merged);
    }

    private static SearchResult ephemeralItemToSearchResult(EphemeralManifestItem item, String troveId, String troveLabel) {
        String title = item.title() != null ? item.title() : "";
        String id = item.id() != null && !item.id().isBlank() ? item.id() : title;
        List<String> files = item.files() != null ? List.copyOf(item.files()) : List.of();
        return new SearchResult(
                id,
                item.itemType() != null && !item.itemType().isBlank() ? item.itemType() : "localDirItem",
                title,
                item.snippet(),
                troveLabel,
                troveId,
                false,
                null,
                null,
                null,
                files,
                item.itemUrl(),
                item.extraFields() != null && !item.extraFields().isEmpty() ? Map.copyOf(item.extraFields()) : null
        );
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

    private static boolean isInterruptedOrAborted(Throwable t) {
        for (Throwable x = t; x != null; x = x.getCause()) {
            if (x.getMessage() != null && x.getMessage().contains("Thread was interrupted")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Full-text body for indexing and non-Lucene matching: title, snippet, and concatenated non-null
     * {@link SearchResult#extraFields()} values (same coverage as title/snippet for search).
     */
    private static String searchableBodyText(SearchResult r) {
        String title = r.title() != null ? r.title() : "";
        String snippet = r.snippet() != null ? r.snippet() : "";
        String extra = extraFieldValuesForSearch(r.extraFields());
        if (extra.isEmpty()) {
            return (title + " " + snippet).trim();
        }
        return (title + " " + snippet + " " + extra).trim();
    }

    private static String extraFieldValuesForSearch(Map<String, Object> extraFields) {
        if (extraFields == null || extraFields.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Object v : extraFields.values()) {
            if (v == null) {
                continue;
            }
            String s = String.valueOf(v);
            if (s.isBlank()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(s);
        }
        return sb.toString();
    }

    /** Build Lucene index from the given list and set luceneDirectory/luceneSearcher. Used so reload can build from new data before replacing allResults. */
    private void buildLuceneIndex(List<SearchResult> from) {
        if (from == null || from.isEmpty()) {
            log.info("Lucene index skipped: no data");
            luceneDirectory = null;
            luceneSearcher = null;
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
                for (int i = 0; i < from.size(); i++) {
                    SearchResult r = from.get(i);
                    Document doc = new Document();
                    String title = r.title() != null ? r.title() : "";
                    String snippet = r.snippet() != null ? r.snippet() : "";
                    String indexedText = searchableBodyText(r);
                    doc.add(new TextField(contentField, indexedText, Field.Store.NO));
                    doc.add(new StringField(troveIdField, r.troveId() != null ? r.troveId() : "", Field.Store.NO));
                    doc.add(new StoredField(idxField, i));
                    writer.addDocument(doc);
                }
                writer.commit();
            }
            luceneDirectory = dir;
            luceneSearcher = new IndexSearcher(DirectoryReader.open(luceneDirectory));
            log.info("Lucene index built: {} documents", from.size());
        } catch (IOException e) {
            log.error("Failed to build Lucene index: {}", e.getMessage(), e);
        }
    }

    private static Set<String> parseTroveIds(String value) {
        if (value == null || value.isBlank()) return Set.of();
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    private void loadFromS3(
            List<SearchResult> combined,
            Set<String> onlyIds,
            Set<String> excludeIds,
            BiConsumer<Integer, Integer> progress,
            Set<String> loadedTroveIds,
            List<String> loadErrors) {
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
                if (bucketPrefix != null) {
                    bucketPrefix = bucketPrefix.trim();
                } else {
                    bucketPrefix = "";
                }
                if (troveId == null || troveId.isEmpty()) {
                    log.warn("Skipping trove entry with no id (tried id, troveId, trove_id); entry: {}", entry);
                    continue;
                }
                if (!onlyIds.isEmpty() && !onlyIds.contains(troveId)) {
                    log.debug("Skipping trove \"{}\" (not in moocho.only.trove.ids)", troveId);
                    continue;
                }
                if (excludeIds.contains(troveId)) {
                    log.debug("Skipping trove \"{}\" (in moocho.exclude.trove.ids)", troveId);
                    continue;
                }
                String key = bucketPrefix.isEmpty() ? troveId + ".json" : bucketPrefix + "/" + troveId + ".json";
                toLoad.add(new TroveS3Key(troveId, key));
            }
            int totalTroves = toLoad.size();
            AtomicInteger completed = progress != null ? new AtomicInteger(0) : null;
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
                            loadedTroveIds.add(tk.troveId);
                            if (completed != null) {
                                progress.accept(completed.incrementAndGet(), totalTroves);
                            }
                            return results.stream();
                        } catch (Exception e) {
                            if (isInterruptedOrAborted(e)) {
                                log.debug("Trove load skipped (interrupted): {}", e.getMessage());
                            } else {
                                log.error("Failed to load trove \"{}\" from S3 (key={}): {}", tk.troveId, tk.key, e.getMessage(), e);
                            }
                            loadErrors.add(tk.troveId + " (S3 key=" + tk.key + "): " + e.getMessage());
                            if (completed != null) {
                                progress.accept(completed.incrementAndGet(), totalTroves);
                            }
                            return Stream.<SearchResult>empty();
                        }
                    })
                    .toList();
            combined.addAll(loaded);
            log.info("Trove load from S3 complete: {} total records", combined.size());
        } catch (Exception e) {
            log.error("Failed to load troves list from S3 (bucket={}): {}", bucketName, e.getMessage(), e);
            loadErrors.add("troves-manifest (bucket=" + bucketName + "): " + e.getMessage());
        }
    }

    private void loadFromClasspath(
            List<SearchResult> combined,
            Set<String> onlyIds,
            Set<String> excludeIds,
            BiConsumer<Integer, Integer> progress,
            Set<String> loadedTroveIds,
            List<String> loadErrors) {
        log.info("Loading trove data from: {}", dataLocation);
        try {
            Resource[] resources = resourceResolver.getResources(dataLocation);
            log.info("Trove data resources found: {}", resources.length);
            Arrays.sort(resources, (a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                    a.getFilename() != null ? a.getFilename() : "",
                    b.getFilename() != null ? b.getFilename() : ""));
            int total = resources.length;
            for (int i = 0; i < resources.length; i++) {
                Resource resource = resources[i];
                try (InputStream in = resource.getInputStream()) {
                    JsonNode root = objectMapper.readTree(in);
                    String troveId = root.has("id") && root.get("id").isTextual()
                            ? root.get("id").asText()
                            : (resource.getFilename() != null ? resource.getFilename() : "unknown");
                    if (!onlyIds.isEmpty() && !onlyIds.contains(troveId)) {
                        log.debug("Skipping trove \"{}\" (not in moocho.only.trove.ids)", troveId);
                        if (progress != null) {
                            progress.accept(i + 1, total);
                        }
                        continue;
                    }
                    if (excludeIds.contains(troveId)) {
                        log.debug("Skipping trove \"{}\" (in moocho.exclude.trove.ids)", troveId);
                        if (progress != null) {
                            progress.accept(i + 1, total);
                        }
                        continue;
                    }
                    List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
                    log.info("Loaded trove \"{}\": {} records", troveId, results.size());
                    loadedTroveIds.add(troveId);
                    combined.addAll(results);
                } catch (Exception e) {
                    log.error("Failed to load trove from {}: {}", resource.getDescription(), e.getMessage(), e);
                    String source = resource.getFilename() != null ? resource.getFilename() : resource.getDescription();
                    loadErrors.add(source + ": " + e.getMessage());
                }
                if (progress != null) {
                    progress.accept(i + 1, total);
                }
            }
        } catch (Exception e) {
            log.error("Failed to resolve trove data from {}: {}", dataLocation, e.getMessage(), e);
            loadErrors.add("resource-resolution (" + dataLocation + "): " + e.getMessage());
        }
    }

    /** Boost factor for the preferred (booster) trove so its hits outrank others. */
    private static final float TROVE_BOOST_FACTOR = 1.2f;

    public List<ScoredSearchResult> search(List<String> troveIds, String query) {
        return search(troveIds, query, null);
    }

    public List<ScoredSearchResult> search(List<String> troveIds, String query, String boostTroveId) {
        Set<String> troveIdSet = troveIds == null ? Set.of() : troveIds.stream()
                .map(t -> t == null ? null : t.trim())
                .filter(t -> t != null && !t.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        String boostId = boostTroveId != null && !boostTroveId.isBlank() ? boostTroveId.trim() : null;
        String queryTrimmed = query == null ? "" : query.trim();
        boolean matchAll = "*".equals(queryTrimmed);
        boolean noTextQuery = queryTrimmed.isEmpty() || matchAll;

        if (noTextQuery) {
            Stream<SearchResult> stream = allResults.stream();
            if (!troveIdSet.isEmpty()) {
                stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
            }
            List<ScoredSearchResult> list = stream.map(r -> new ScoredSearchResult(r, 0.0)).toList();
            return boostId != null ? sortWithBoostTroveFirst(list, boostId) : list;
        }

        // Regex delimited by slashes: match full title+snippet with Java Pattern (not per-term Lucene regex)
        if (SearchQueryBuilder.isRegexDelimited(queryTrimmed)) {
            String patternStr = queryTrimmed.substring(1, queryTrimmed.length() - 1);
            if (!patternStr.isEmpty()) {
                try {
                    Pattern pattern = Pattern.compile(patternStr, Pattern.CASE_INSENSITIVE);
                    Stream<SearchResult> stream = allResults.stream();
                    if (!troveIdSet.isEmpty()) {
                        stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
                    }
                    List<ScoredSearchResult> out = stream
                            .filter(r -> {
                                String text = searchableBodyText(r);
                                return pattern.matcher(text).find();
                            })
                            .map(r -> new ScoredSearchResult(r, 1.0))
                            .toList();
                    return boostId != null ? sortWithBoostTroveFirst(out, boostId) : out;
                } catch (Exception e) {
                    log.debug("Invalid regex \"{}\", falling back: {}", patternStr, e.getMessage());
                }
            }
        }

        if (luceneSearcher == null) {
            List<ScoredSearchResult> fallback = searchFallbackScored(troveIdSet, queryTrimmed);
            return boostId != null ? sortWithBoostTroveFirst(fallback, boostId) : fallback;
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
            if (boostId != null) {
                bq.add(new BoostQuery(new TermQuery(new Term("troveId", boostId)), TROVE_BOOST_FACTOR), BooleanClause.Occur.SHOULD);
            }
            TopDocs topDocs = luceneSearcher.search(bq.build(), allResults.size());
            List<ScoredSearchResult> out = new ArrayList<>(topDocs.scoreDocs.length);
            StoredFields storedFields = luceneSearcher.storedFields();
            for (ScoreDoc sd : topDocs.scoreDocs) {
                Document hitDoc = storedFields.document(sd.doc);
                IndexableField idxField = hitDoc.getField("idx");
                if (idxField != null && idxField.numericValue() != null) {
                    int idx = idxField.numericValue().intValue();
                    if (idx >= 0 && idx < allResults.size()) {
                        out.add(new ScoredSearchResult(allResults.get(idx), sd.score));
                    }
                }
            }
            return out;
        } catch (ParseException e) {
            log.debug("Lucene parse failed for query \"{}\", falling back to substring match: {}", queryTrimmed, e.getMessage());
            List<ScoredSearchResult> fallback = searchFallbackScored(troveIdSet, queryTrimmed);
            return boostId != null ? sortWithBoostTroveFirst(fallback, boostId) : fallback;
        } catch (IOException e) {
            log.warn("Lucene search failed: {}, falling back to substring match", e.getMessage());
            List<ScoredSearchResult> fallback = searchFallbackScored(troveIdSet, queryTrimmed);
            return boostId != null ? sortWithBoostTroveFirst(fallback, boostId) : fallback;
        }
    }

    private static final String CONTENT_FIELD = "content";

    /**
     * Build a query that matches each token from the user query. Terms ending with {@code *}
     * are treated as prefix matches; other terms use fuzzy match. Returns null if no terms.
     */
    private Query buildFuzzyQuery(String queryTrimmed) throws IOException {
        return SearchQueryBuilder.buildQuery(queryTrimmed, luceneAnalyzer, CONTENT_FIELD);
    }

    /** Return a new list sorted so that results from the boosted trove come first (for no-text and regex paths). */
    private static List<ScoredSearchResult> sortWithBoostTroveFirst(List<ScoredSearchResult> list, String boostTroveId) {
        if (list == null || boostTroveId == null) {
            return list;
        }
        List<ScoredSearchResult> copy = new ArrayList<>(list);
        copy.sort((a, b) -> {
            boolean aBoost = boostTroveId.equals(a.result().troveId());
            boolean bBoost = boostTroveId.equals(b.result().troveId());
            if (aBoost == bBoost) {
                return 0;
            }
            return aBoost ? -1 : 1;
        });
        return copy;
    }

    private List<SearchResult> searchFallback(Set<String> troveIdSet, String queryTrimmed) {
        String queryLower = queryTrimmed.toLowerCase();
        Stream<SearchResult> stream = allResults.stream();
        if (!troveIdSet.isEmpty()) {
            stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
        }
        stream = stream.filter(r -> {
            String body = searchableBodyText(r).toLowerCase();
            return body.contains(queryLower);
        });
        return stream.toList();
    }

    private List<ScoredSearchResult> searchFallbackScored(Set<String> troveIdSet, String queryTrimmed) {
        List<SearchResult> list = searchFallback(troveIdSet, queryTrimmed);
        return list.stream().map(r -> new ScoredSearchResult(r, 0.0)).toList();
    }

    /**
     * Find duplicate/near-duplicate items: for each item in the primary trove (matching query),
     * find similar items in the compare troves by Lucene similarity (query = primary item content).
     */
    public List<DuplicateMatchRow> searchDuplicates(String primaryTroveId, Set<String> compareTroveIds,
                                                     String query, int maxMatchesPerPrimary) {
        return searchDuplicates(primaryTroveId, compareTroveIds, query, maxMatchesPerPrimary, null);
    }

    public List<DuplicateMatchRow> searchDuplicates(String primaryTroveId, Set<String> compareTroveIds,
                                                     String query, int maxMatchesPerPrimary,
                                                     BiConsumer<Integer, Integer> progress) {
        if (primaryTroveId == null || primaryTroveId.isBlank()) {
            return List.of();
        }
        Set<String> compareSet = compareTroveIds == null ? Set.of() : compareTroveIds.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (compareSet.isEmpty()) {
            return List.of();
        }

        List<ScoredSearchResult> primaryScored = search(List.of(primaryTroveId), query != null ? query.trim() : "");
        if (primaryScored.isEmpty()) {
            return List.of();
        }

        int total = primaryScored.size();
        if (progress != null) {
            progress.accept(0, total);
        }

        int maxMatch = Math.max(1, Math.min(maxMatchesPerPrimary, 50));
        List<DuplicateMatchRow> rows = new ArrayList<>(primaryScored.size());
        for (int i = 0; i < primaryScored.size(); i++) {
            ScoredSearchResult ss = primaryScored.get(i);
            SearchResult primary = ss.result();
            List<ScoredSearchResult> matches = findSimilarInTroves(primary, compareSet, maxMatch);
            matches = filterMatchesByYearHeuristic(primary, matches);
            matches = matches.stream().limit(5).toList();
            if (!matches.isEmpty()) {
                rows.add(new DuplicateMatchRow(primary, matches));
            }
            if (progress != null && ((i + 1) % 31 == 0 || i + 1 == total)) {
                progress.accept(i + 1, total);
            }
            if ((i + 1) % 500 == 0) {
                log.info("Duplicates analysis: {}/{} items", i + 1, total);
            }
        }
        List<DuplicateMatchRow> deduped = deduplicateDuplicateRowsByGroup(rows);
        deduped.sort((a, b) -> Double.compare(maxMatchScore(b), maxMatchScore(a)));
        return deduped;
    }

    private static double maxMatchScore(DuplicateMatchRow row) {
        if (row.matches() == null || row.matches().isEmpty()) {
            return 0.0;
        }
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
            if (row.primary() != null && row.primary().id() != null) {
                group.add(row.primary().id());
            }
            for (ScoredSearchResult m : row.matches() != null ? row.matches() : List.<ScoredSearchResult>of()) {
                if (m.result() != null && m.result().id() != null) {
                    group.add(m.result().id());
                }
            }
            if (group.isEmpty()) {
                continue;
            }
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
        return searchUniques(primaryTroveId, compareTroveIds, query, null);
    }

    public List<UniqueResult> searchUniques(String primaryTroveId, Set<String> compareTroveIds, String query,
                                            BiConsumer<Integer, Integer> progress) {
        if (primaryTroveId == null || primaryTroveId.isBlank()) {
            return List.of();
        }
        Set<String> compareSet = compareTroveIds == null ? Set.of() : compareTroveIds.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (compareSet.isEmpty()) {
            return List.of();
        }

        List<ScoredSearchResult> primaryScored = search(List.of(primaryTroveId), query != null ? query.trim() : "");
        if (primaryScored.isEmpty()) {
            return List.of();
        }

        int total = primaryScored.size();
        if (progress != null) {
            progress.accept(0, total);
        }

        List<UniqueResult> uniquesWithScore = new ArrayList<>(primaryScored.size());
        for (int i = 0; i < primaryScored.size(); i++) {
            ScoredSearchResult ss = primaryScored.get(i);
            SearchResult primary = ss.result();
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
            if (progress != null && ((i + 1) % 31 == 0 || i + 1 == total)) {
                progress.accept(i + 1, total);
            }
            if ((i + 1) % 500 == 0) {
                log.info("Uniques analysis: {}/{} items", i + 1, total);
            }
        }
        uniquesWithScore.sort(java.util.Comparator.comparingDouble(UniqueResult::score));
        return uniquesWithScore;
    }

    /**
     * One-pass computation of both duplicates and uniques for the same (primary, compare, query).
     * Used so that a dups request populates the cache for the corresponding uniques request and vice versa.
     * Duplicate rows are stored with up to 50 matches each; callers may trim to a smaller maxMatches when returning.
     */
    public DupUniqPair searchDuplicatesAndUniques(String primaryTroveId, Set<String> compareTroveIds, String query,
                                                   BiConsumer<Integer, Integer> progress) {
        if (primaryTroveId == null || primaryTroveId.isBlank()) {
            return new DupUniqPair(List.of(), List.of());
        }
        Set<String> compareSet = compareTroveIds == null ? Set.of() : compareTroveIds.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (compareSet.isEmpty()) {
            return new DupUniqPair(List.of(), List.of());
        }

        List<ScoredSearchResult> primaryScored = search(List.of(primaryTroveId), query != null ? query.trim() : "");
        if (primaryScored.isEmpty()) {
            return new DupUniqPair(List.of(), List.of());
        }

        int total = primaryScored.size();
        if (progress != null) {
            progress.accept(0, total);
        }

        List<DuplicateMatchRow> dupRows = new ArrayList<>(primaryScored.size());
        List<UniqueResult> uniquesWithScore = new ArrayList<>(primaryScored.size());
        final int maxMatch = 50;

        for (int i = 0; i < primaryScored.size(); i++) {
            ScoredSearchResult ss = primaryScored.get(i);
            SearchResult primary = ss.result();
            List<ScoredSearchResult> rawMatches = findSimilarInTroves(primary, compareSet, maxMatch);
            List<ScoredSearchResult> filtered = filterMatchesByYearHeuristic(primary, rawMatches);
            if (!filtered.isEmpty()) {
                List<ScoredSearchResult> matches = filtered.stream().limit(maxMatch).toList();
                dupRows.add(new DuplicateMatchRow(primary, matches));
            } else {
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
            if (progress != null && ((i + 1) % 31 == 0 || i + 1 == total)) {
                progress.accept(i + 1, total);
            }
            if ((i + 1) % 500 == 0) {
                log.info("Duplicates/uniques analysis: {}/{} items", i + 1, total);
            }
        }

        List<DuplicateMatchRow> deduped = deduplicateDuplicateRowsByGroup(dupRows);
        deduped.sort((a, b) -> Double.compare(maxMatchScore(b), maxMatchScore(a)));
        uniquesWithScore.sort(java.util.Comparator.comparingDouble(UniqueResult::score));
        return new DupUniqPair(deduped, uniquesWithScore);
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
        if (na.isEmpty() || nb.isEmpty()) {
            return false;
        }
        return na.equals(nb) || nb.contains(na) || na.contains(nb);
    }

    /** Lowercase, strip accents, and normalize punctuation so "Léon" vs "Leon" and "2001-" vs "2001:" compare equal. */
    private static String normalizeForComparison(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return "";
        }
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
        if (queryStr.isEmpty()) {
            return List.of();
        }
        if (luceneSearcher == null) {
            return List.of();
        }

        try {
            BooleanQuery.Builder bq = new BooleanQuery.Builder();
            List<BytesRef> terms = troveIds.stream().map(BytesRef::new).toList();
            bq.add(new TermInSetQuery("troveId", terms), BooleanClause.Occur.FILTER);
            Query textQuery = buildFuzzyQuery(queryStr);
            if (textQuery == null) {
                QueryParser parser = new QueryParser("content", luceneAnalyzer);
                parser.setDefaultOperator(QueryParser.Operator.OR);
                textQuery = parser.parse(QueryParser.escape(queryStr));
            }
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
                        if (Objects.equals(r.id(), similarTo.id())) {
                            continue;
                        }
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
                    return new TroveOption(id, name, items.size(), cliCreatedEphemeralTroveIds.contains(id));
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

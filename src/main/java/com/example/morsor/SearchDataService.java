package com.example.morsor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
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
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
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
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import org.apache.lucene.util.BytesRef;

@Service
public class SearchDataService {

    private static final String DATA_LOCATION = "classpath*:data/*.json";
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
    private final StandardAnalyzer luceneAnalyzer = new StandardAnalyzer();

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
        log.info("Loading from classpath: {}", DATA_LOCATION);
        try {
            Resource[] resources = resourceResolver.getResources(DATA_LOCATION);
            log.info("Classpath data resources found: {}", resources.length);
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
            log.error("Failed to resolve data resources {}: {}", DATA_LOCATION, e.getMessage(), e);
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
            QueryParser parser = new QueryParser("content", luceneAnalyzer);
            parser.setDefaultOperator(QueryParser.Operator.AND);
            Query textQuery = parser.parse(QueryParser.escape(queryTrimmed));
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

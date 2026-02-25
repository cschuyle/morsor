package com.example.morsor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

@Service
public class SearchDataService {

    private static final String DATA_LOCATION = "classpath:data/*.json";
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
        boolean useS3 = environment.acceptsProfiles(Profiles.of("prod"));
        log.info("Trove load: useS3={}, bucketName={}", useS3, bucketName != null ? bucketName : "(null)");
        if (useS3 && bucketName != null && !bucketName.isBlank()) {
            loadFromS3(combined, onlyIds);
        } else {
            if (useS3 && (bucketName == null || bucketName.isBlank())) {
                log.warn("Prod profile active but moocho.bucket.name is empty; loading from classpath");
            }
            loadFromClasspath(combined, onlyIds);
        }
        allResults = combined;
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
                log.info("Fetching trove from S3: key={}", key);
                try (InputStream in = s3.getObject(GetObjectRequest.builder()
                                .bucket(bucketName)
                                .key(key)
                                .build())) {
                    JsonNode root2 = objectMapper.readTree(in);
                    List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root2);
                    log.info("Loaded trove \"{}\": {} records", troveId, results.size());
                    combined.addAll(results);
                } catch (Exception e) {
                    log.error("Failed to load trove \"{}\" from S3 (key={}): {}", troveId, key, e.getMessage(), e);
                }
            }
            log.info("Trove load from S3 complete: {} total records", combined.size());
        } catch (Exception e) {
            log.error("Failed to load troves list from S3 (bucket={}): {}", bucketName, e.getMessage(), e);
        }
    }

    private void loadFromClasspath(List<SearchResult> combined, Set<String> onlyIds) {
        log.info("Loading from classpath");
        try {
            Resource[] resources = resourceResolver.getResources(DATA_LOCATION);
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
        String queryLower = query == null ? "" : query.trim().toLowerCase();
        Stream<SearchResult> stream = allResults.stream();
        if (!troveIdSet.isEmpty()) {
            stream = stream.filter(r -> r.troveId() != null && troveIdSet.contains(r.troveId()));
        }
        boolean matchAll = "*".equals(query != null ? query.trim() : "");
        if (!queryLower.isEmpty() && !matchAll) {
            stream = stream.filter(r ->
                    (r.title() != null && r.title().toLowerCase().contains(queryLower))
                            || (r.snippet() != null && r.snippet().toLowerCase().contains(queryLower)));
        }
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
}

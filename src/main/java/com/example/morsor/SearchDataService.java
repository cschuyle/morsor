package com.example.morsor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

@Service
public class SearchDataService {

    private static final String DATA_LOCATION = "classpath:data/*.json";

    private static final Logger log = LoggerFactory.getLogger(SearchDataService.class);

    private final ResourcePatternResolver resourceResolver;
    private final ObjectMapper objectMapper;

    private List<SearchResult> allResults = List.of();

    public SearchDataService(ResourcePatternResolver resourceResolver, ObjectMapper objectMapper) {
        this.resourceResolver = resourceResolver;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void loadData() {
        List<SearchResult> combined = new ArrayList<>();
        try {
            Resource[] resources = resourceResolver.getResources(DATA_LOCATION);
            Arrays.sort(resources, (a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                    a.getFilename() != null ? a.getFilename() : "",
                    b.getFilename() != null ? b.getFilename() : ""));
            for (Resource resource : resources) {
                try (InputStream in = resource.getInputStream()) {
                    JsonNode root = objectMapper.readTree(in);
                    List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
                    String troveId = root.has("id") && root.get("id").isTextual()
                            ? root.get("id").asText()
                            : (resource.getFilename() != null ? resource.getFilename() : "unknown");
                    log.info("Loaded trove \"{}\": {} records", troveId, results.size());
                    combined.addAll(results);
                } catch (Exception e) {
                    log.error("Failed to load trove from {}: {}", resource.getDescription(), e.getMessage(), e);
                }
            }
            allResults = combined;
        } catch (Exception e) {
            log.error("Failed to resolve data resources {}: {}", DATA_LOCATION, e.getMessage(), e);
            allResults = List.of();
        }
    }

    public List<SearchResult> search(String trove, String query) {
        String troveLower = trove == null ? "" : trove.trim().toLowerCase();
        String queryLower = query == null ? "" : query.trim().toLowerCase();
        Stream<SearchResult> stream = allResults.stream();
        if (!troveLower.isEmpty()) {
            stream = stream.filter(r -> r.trove() != null && r.trove().toLowerCase().contains(troveLower));
        }
        if (!queryLower.isEmpty()) {
            stream = stream.filter(r ->
                    (r.title() != null && r.title().toLowerCase().contains(queryLower))
                            || (r.snippet() != null && r.snippet().toLowerCase().contains(queryLower)));
        }
        return stream.toList();
    }

    public List<String> getTroveNames() {
        return allResults.stream()
                .map(SearchResult::trove)
                .filter(t -> t != null && !t.isBlank())
                .distinct()
                .sorted()
                .toList();
    }
}

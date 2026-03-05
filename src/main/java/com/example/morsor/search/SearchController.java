package com.example.morsor.search;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class SearchController {

    private final SearchDataService searchDataService;
    private final SearchCache searchCache;

    public SearchController(SearchDataService searchDataService, SearchCache searchCache) {
        this.searchDataService = searchDataService;
        this.searchCache = searchCache;
    }

    @GetMapping("/troves")
    public List<TroveOption> troves() {
        return searchDataService.getTroveOptions();
    }

    /** Status and cache stats for the UI; avoids dependency on actuator health contributor API. */
    @GetMapping("/status")
    public StatusResponse status() {
        SearchCache.CacheStats stats = searchCache.getStats();
        return new StatusResponse("UP", new CacheStatus(stats.entryCount(), stats.estimatedBytes()));
    }

    public record StatusResponse(String status, CacheStatus cache) {}
    public record CacheStatus(int entries, long estimatedBytes) {}

    private static final int DEFAULT_PAGE_SIZE = 500;
    private static final int MAX_PAGE_SIZE = 10_000;

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam(required = false) List<String> trove,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false) String fileTypes,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "500") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        page = Math.max(0, page);
        size = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        String cacheKey = "s:" + (query != null ? query.trim() : "") + ":"
                + (trove != null ? trove.stream().filter(t -> t != null).sorted().collect(Collectors.joining(",")) : "");
        String queryVal = query != null ? query.trim() : "";
        boolean isWildcard = "*".equals(queryVal) || queryVal.isEmpty();
        SearchCache.CacheResult<ScoredSearchResult> cacheResult = searchCache.getOrCompute(cacheKey, () -> searchDataService.search(trove, query));
        List<ScoredSearchResult> scored = cacheResult.data();
        List<SearchResultWithScore> all = scored.stream()
                .map(ss -> new SearchResultWithScore(ss.result(), isWildcard ? null : ss.score()))
                .toList();
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<SearchResultWithScore> cmp = comparatorForWithScore(sortBy);
            if (cmp != null) {
                if (descending) cmp = cmp.reversed();
                all = all.stream().sorted(cmp).toList();
            }
        }
        // Multiple selected file types: disjunction (OR) — keep items that have at least one file of any selected type.
        // Accept comma-separated (e.g. fileTypes=MP3,PDF) so all values are reliably received.
        List<String> fileTypesFilter = fileTypes != null && !fileTypes.isBlank()
                ? java.util.Arrays.stream(fileTypes.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isBlank())
                        .toList()
                : List.of();
        if (!fileTypesFilter.isEmpty()) {
            Set<String> extSet = fileTypesFilter.stream().map(String::toUpperCase).collect(Collectors.toSet());
            all = all.stream()
                    .filter(r -> hasFileWithAnyExtension(r.result(), extSet))
                    .toList();
        }
        List<String> availableFileTypes = collectFileTypes(all);
        long total = all.size();
        Map<String, Long> troveCounts = all.stream()
                .filter(r -> r.result().troveId() != null && !r.result().troveId().isBlank())
                .collect(Collectors.groupingBy(r -> r.result().troveId(), Collectors.counting()));
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<SearchResultWithScore> pageResults = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new SearchResponse(total, pageResults, page, size, troveCounts, availableFileTypes, warning);
    }

    /** Returns true if the result has at least one file whose extension is in the set (disjunction: any match). */
    private static boolean hasFileWithAnyExtension(SearchResult result, Set<String> extensions) {
        if (result.files() == null || extensions == null || extensions.isEmpty()) return false;
        for (String url : result.files()) {
            if (url != null) {
                String ext = extractExtension(url);
                if (ext != null && extensions.contains(ext)) return true;
            }
        }
        return false;
    }

    private static String extractExtension(String url) {
        if (url == null) return null;
        int q = url.indexOf('?');
        String path = q >= 0 ? url.substring(0, q) : url;
        int lastDot = path.lastIndexOf('.');
        if (lastDot >= 0 && lastDot < path.length() - 1) {
            return path.substring(lastDot + 1).toUpperCase();
        }
        return null;
    }

    private static List<String> collectFileTypes(List<SearchResultWithScore> results) {
        Set<String> types = new TreeSet<>();
        for (SearchResultWithScore r : results) {
            if (r.result().files() != null) {
                for (String url : r.result().files()) {
                    String ext = extractExtension(url);
                    if (ext != null && !ext.isEmpty()) types.add(ext);
                }
            }
        }
        return List.copyOf(types);
    }

    private static final int DEFAULT_DUPLICATES_MAX_MATCHES = 20;

    @GetMapping("/search/duplicates")
    public DuplicatesResponse searchDuplicates(
            @RequestParam(required = true) String primaryTrove,
            @RequestParam(required = false) List<String> compareTrove,
            @RequestParam(required = false, defaultValue = "*") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false, defaultValue = "20") int maxMatches) {
        final int pageNum = Math.max(0, page);
        final int pageSize = Math.min(500, Math.max(1, size));
        final int maxMatchesVal = Math.min(50, Math.max(1, maxMatches));
        Set<String> compareSet = compareTrove == null ? Set.of() : compareTrove.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        final String primaryTrimmed = primaryTrove.trim();
        final String queryVal = query != null ? query : "*";
        String cacheKey = "d:" + primaryTrimmed + ":"
                + compareSet.stream().sorted().collect(Collectors.joining(",")) + ":"
                + queryVal + ":" + maxMatchesVal;
        SearchCache.CacheResult<DuplicateMatchRow> cacheResult = searchCache.getOrCompute(cacheKey,
                () -> searchDataService.searchDuplicates(primaryTrimmed, compareSet, queryVal, maxMatchesVal));
        List<DuplicateMatchRow> all = cacheResult.data();
        long total = all.size();
        int from = (int) Math.min((long) pageNum * pageSize, total);
        int to = (int) Math.min(from + pageSize, total);
        List<DuplicateMatchRow> rows = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new DuplicatesResponse(total, pageNum, pageSize, rows, warning);
    }

    @GetMapping("/search/uniques")
    public UniquesResponse searchUniques(
            @RequestParam(required = true) String primaryTrove,
            @RequestParam(required = false) List<String> compareTrove,
            @RequestParam(required = false, defaultValue = "*") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        page = Math.max(0, page);
        size = Math.min(500, Math.max(1, size));
        Set<String> compareSet = compareTrove == null ? Set.of() : compareTrove.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        String cacheKey = "u:" + primaryTrove.trim() + ":"
                + compareSet.stream().sorted().collect(Collectors.joining(",")) + ":"
                + (query != null ? query : "*");
        SearchCache.CacheResult<UniqueResult> cacheResult = searchCache.getOrCompute(cacheKey,
                () -> searchDataService.searchUniques(primaryTrove.trim(), compareSet, query));
        List<UniqueResult> all = cacheResult.data();
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<UniqueResult> cmp = uniquesComparatorFor(sortBy);
            if (cmp != null) {
                if (descending) cmp = cmp.reversed();
                all = all.stream().sorted(cmp).toList();
            }
        }
        long total = all.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<UniqueResult> results = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new UniquesResponse(total, page, size, results, warning);
    }

    private static Comparator<UniqueResult> uniquesComparatorFor(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "title" -> Comparator.comparing(
                    u -> u.item().title() != null ? u.item().title().toLowerCase() : "");
            case "trove" -> Comparator.comparing(
                    u -> u.item().trove() != null ? u.item().trove().toLowerCase() : "");
            case "score" -> Comparator.comparingDouble(UniqueResult::score);
            default -> null;
        };
    }

    private static Comparator<SearchResult> comparatorFor(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "title" -> Comparator.comparing(
                    r -> r.title() != null ? r.title().toLowerCase() : "");
            case "trove" -> Comparator.comparing(
                    r -> r.trove() != null ? r.trove().toLowerCase() : "");
            default -> null;
        };
    }

    private static Comparator<SearchResultWithScore> comparatorForWithScore(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "title" -> Comparator.comparing(
                    r -> r.result().title() != null ? r.result().title().toLowerCase() : "");
            case "trove" -> Comparator.comparing(
                    r -> r.result().trove() != null ? r.result().trove().toLowerCase() : "");
            case "score" -> Comparator.comparing(
                    SearchResultWithScore::score,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            default -> null;
        };
    }
}

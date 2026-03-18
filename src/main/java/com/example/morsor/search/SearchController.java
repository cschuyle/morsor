package com.example.morsor.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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
    private final ObjectMapper objectMapper;

    public SearchController(SearchDataService searchDataService, SearchCache searchCache, ObjectMapper objectMapper) {
        this.searchDataService = searchDataService;
        this.searchCache = searchCache;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/troves")
    public List<TroveOption> troves() {
        return searchDataService.getTroveOptions();
    }

    @PostMapping("/troves/reload")
    public void reloadTroves() {
        searchDataService.reloadData();
        searchCache.clear();
    }

    /** Streams NDJSON progress (current, total) during reload; total may be 0 when unknown. Use for UI progress bar. */
    @PostMapping(value = "/troves/reload/stream", produces = "application/x-ndjson")
    public ResponseEntity<StreamingResponseBody> reloadTrovesStream() {
        SecurityContext securityContext = SecurityContextHolder.getContext();
        ObjectMapper om = this.objectMapper;
        AtomicBoolean cancelled = new AtomicBoolean(false);
        StreamingResponseBody stream = out -> {
            try {
                SecurityContextHolder.setContext(securityContext);
                searchDataService.reloadData((current, total) -> {
                    if (cancelled.get()) return;
                    synchronized (out) {
                        try {
                            out.write(om.writeValueAsBytes(Map.of("type", "progress", "current", current, "total", total)));
                            out.write('\n');
                            out.flush();
                        } catch (IOException e) {
                            cancelled.set(true);
                        }
                    }
                }, cancelled);
                if (cancelled.get()) return;
                searchCache.clear();
                out.write(om.writeValueAsBytes(Map.of("type", "done")));
                out.write('\n');
                out.flush();
            } catch (Exception e) {
                if (e instanceof UncheckedIOException u) {
                    throw u;
                }
                throw new RuntimeException(e);
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/x-ndjson; charset=utf-8")
                .body(stream);
    }

    /** Status and cache stats for the UI; avoids dependency on actuator health contributor API. */
    @GetMapping("/status")
    public StatusResponse status() {
        SearchCache.CacheStats stats = searchCache.getStats();
        return new StatusResponse("UP", new CacheStatus(stats.entryCount(), stats.estimatedBytes()));
    }

    public record StatusResponse(String status, CacheStatus cache) {}
    public record CacheStatus(int entries, long estimatedBytes) {}

    @PostMapping("/cache/clear")
    public void clearCache() {
        searchCache.clear();
    }

    private static final int DEFAULT_PAGE_SIZE = 500;
    private static final int MAX_PAGE_SIZE = 10_000;

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam(required = false) List<String> trove,
            @RequestParam(required = false) String boostTrove,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false) String fileTypes,
            @RequestParam(required = false, defaultValue = "false") boolean thumbs,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "500") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        page = Math.max(0, page);
        size = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        String boostVal = boostTrove != null && !boostTrove.isBlank() ? boostTrove.trim() : "";
        String cacheKey = "s:" + (query != null ? query.trim() : "") + ":"
                + (trove != null ? trove.stream().filter(t -> t != null).sorted().collect(Collectors.joining(",")) : "") + ":b:" + boostVal;
        String queryVal = query != null ? query.trim() : "";
        boolean isWildcard = "*".equals(queryVal) || queryVal.isEmpty();
        SearchCache.CacheResult<ScoredSearchResult> cacheResult = searchCache.getOrCompute(cacheKey, () -> searchDataService.search(trove, query, boostVal.isEmpty() ? null : boostVal));
        List<ScoredSearchResult> scored = cacheResult.data();
        List<SearchResultWithScore> all = scored.stream()
                .map(ss -> new SearchResultWithScore(ss.result(), isWildcard ? null : ss.score()))
                .toList();
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<SearchResultWithScore> cmp = comparatorForWithScore(sortBy);
            if (cmp != null) {
                if (descending) {
                    cmp = cmp.reversed();
                }
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
                    .filter(r -> FileTypeCounts.hasFileWithAnyExtension(r.result(), extSet))
                    .toList();
        }
        if (thumbs) {
            all = all.stream()
                    .filter(r -> r.result().hasThumbnail())
                    .toList();
        }
        List<String> availableFileTypes = FileTypeCounts.collectFileTypes(all);
        long total = all.size();
        Map<String, Long> troveCounts = all.stream()
                .filter(r -> r.result().troveId() != null && !r.result().troveId().isBlank())
                .collect(Collectors.groupingBy(r -> r.result().troveId(), Collectors.counting()));
        Map<String, Long> fileTypeCounts = FileTypeCounts.countPerFileType(all);
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<SearchResultWithScore> pageResults = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new SearchResponse(total, pageResults, page, size, troveCounts, availableFileTypes, fileTypeCounts, warning);
    }

    private static final int DEFAULT_DUPLICATES_MAX_MATCHES = 20;

    @GetMapping("/search/duplicates")
    public DuplicatesResponse searchDuplicates(
            @RequestParam(required = true) String primaryTrove,
            @RequestParam(required = false) List<String> compareTrove,
            @RequestParam(required = false, defaultValue = "*") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false, defaultValue = "20") int maxMatches,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        final int pageNum = Math.max(0, page);
        final int pageSize = Math.min(500, Math.max(1, size));
        final int maxMatchesVal = Math.min(50, Math.max(1, maxMatches));
        Set<String> compareSet = compareTrove == null ? Set.of() : compareTrove.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        final String primaryTrimmed = primaryTrove.trim();
        final String queryVal = query != null ? query : "*";
        String cacheKey = dupUniqCacheKey(primaryTrimmed, compareSet, queryVal);
        SearchCache.DupUniqCacheResult cacheResult = searchCache.getOrComputeDupUniq(cacheKey,
                () -> searchDataService.searchDuplicatesAndUniques(primaryTrimmed, compareSet, queryVal, null));
        List<DuplicateMatchRow> all = trimDuplicateMatches(cacheResult.pair().duplicates(), maxMatchesVal);
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<DuplicateMatchRow> cmp = duplicatesComparatorFor(sortBy);
            if (cmp != null) {
                if (descending) {
                    cmp = cmp.reversed();
                }
                all = all.stream().sorted(cmp).toList();
            }
        }
        long total = all.size();
        int from = (int) Math.min((long) pageNum * pageSize, total);
        int to = (int) Math.min(from + pageSize, total);
        List<DuplicateMatchRow> rows = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new DuplicatesResponse(total, pageNum, pageSize, rows, warning);
    }

    @GetMapping(value = "/search/duplicates/stream", produces = "application/x-ndjson")
    public org.springframework.http.ResponseEntity<StreamingResponseBody> streamDuplicates(
            @RequestParam(required = true) String primaryTrove,
            @RequestParam(required = false) List<String> compareTrove,
            @RequestParam(required = false, defaultValue = "*") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false, defaultValue = "20") int maxMatches,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        final int pageNum = Math.max(0, page);
        final int pageSize = Math.min(500, Math.max(1, size));
        final int maxMatchesVal = Math.min(50, Math.max(1, maxMatches));
        Set<String> compareSet = compareTrove == null ? Set.of() : compareTrove.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        final String primaryTrimmed = primaryTrove.trim();
        final String queryVal = query != null ? query : "*";
        String cacheKey = dupUniqCacheKey(primaryTrimmed, compareSet, queryVal);
        final boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        final String sortByVal = sortBy;
        ObjectMapper om = this.objectMapper;
        SecurityContext securityContext = SecurityContextHolder.getContext();
        StreamingResponseBody stream = out -> {
            try {
                SecurityContextHolder.setContext(securityContext);
                SearchCache.DupUniqCacheResult cacheResult = searchCache.getOrComputeDupUniq(cacheKey, () ->
                        searchDataService.searchDuplicatesAndUniques(primaryTrimmed, compareSet, queryVal, (current, total) -> {
                            try {
                                out.write(om.writeValueAsBytes(Map.of("type", "progress", "current", current, "total", total)));
                                out.write('\n');
                                out.flush();
                            } catch (IOException e) {
                                throw new UncheckedIOException(e);
                            }
                        }));
                List<DuplicateMatchRow> all = trimDuplicateMatches(cacheResult.pair().duplicates(), maxMatchesVal);
                if (sortByVal != null && !sortByVal.isBlank()) {
                    Comparator<DuplicateMatchRow> cmp = duplicatesComparatorFor(sortByVal);
                    if (cmp != null) {
                        if (descending) {
                            cmp = cmp.reversed();
                        }
                        all = all.stream().sorted(cmp).toList();
                    }
                }
                long total = all.size();
                int from = (int) Math.min((long) pageNum * pageSize, total);
                int to = (int) Math.min(from + pageSize, total);
                List<DuplicateMatchRow> rows = from < to ? all.subList(from, to) : List.of();
                String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
                DuplicatesResponse resp = new DuplicatesResponse(total, pageNum, pageSize, rows, warning);
                out.write(om.writeValueAsBytes(Map.of("type", "done", "result", resp)));
                out.write('\n');
                out.flush();
            } catch (Exception e) {
                if (e instanceof UncheckedIOException u) {
                    throw u;
                }
                throw new RuntimeException(e);
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
        return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_TYPE, "application/x-ndjson; charset=utf-8")
                .body(stream);
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
        final String primaryTrimmed = primaryTrove.trim();
        final String queryVal = query != null ? query : "*";
        String cacheKey = dupUniqCacheKey(primaryTrimmed, compareSet, queryVal);
        SearchCache.DupUniqCacheResult cacheResult = searchCache.getOrComputeDupUniq(cacheKey,
                () -> searchDataService.searchDuplicatesAndUniques(primaryTrimmed, compareSet, queryVal, null));
        List<UniqueResult> all = cacheResult.pair().uniques();
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<UniqueResult> cmp = uniquesComparatorFor(sortBy);
            if (cmp != null) {
                if (descending) {
                    cmp = cmp.reversed();
                }
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

    @GetMapping(value = "/search/uniques/stream", produces = "application/x-ndjson")
    public org.springframework.http.ResponseEntity<StreamingResponseBody> streamUniques(
            @RequestParam(required = true) String primaryTrove,
            @RequestParam(required = false) List<String> compareTrove,
            @RequestParam(required = false, defaultValue = "*") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        final int pageNum = Math.max(0, page);
        final int pageSize = Math.min(500, Math.max(1, size));
        Set<String> compareSet = compareTrove == null ? Set.of() : compareTrove.stream()
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        final String primaryTrimmed = primaryTrove.trim();
        final String queryVal = query != null ? query : "*";
        String cacheKey = dupUniqCacheKey(primaryTrimmed, compareSet, queryVal);
        ObjectMapper om = this.objectMapper;
        SecurityContext securityContext = SecurityContextHolder.getContext();
        StreamingResponseBody stream = out -> {
            try {
                SecurityContextHolder.setContext(securityContext);
                SearchCache.DupUniqCacheResult cacheResult = searchCache.getOrComputeDupUniq(cacheKey, () ->
                        searchDataService.searchDuplicatesAndUniques(primaryTrimmed, compareSet, queryVal, (current, total) -> {
                            try {
                                out.write(om.writeValueAsBytes(Map.of("type", "progress", "current", current, "total", total)));
                                out.write('\n');
                                out.flush();
                            } catch (IOException e) {
                                throw new UncheckedIOException(e);
                            }
                        }));
                List<UniqueResult> all = cacheResult.pair().uniques();
                boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
                if (sortBy != null && !sortBy.isBlank()) {
                    Comparator<UniqueResult> cmp = uniquesComparatorFor(sortBy);
                    if (cmp != null) {
                        if (descending) {
                            cmp = cmp.reversed();
                        }
                        all = all.stream().sorted(cmp).toList();
                    }
                }
                long total = all.size();
                int from = (int) Math.min((long) pageNum * pageSize, total);
                int to = (int) Math.min(from + pageSize, total);
                List<UniqueResult> results = from < to ? all.subList(from, to) : List.of();
                String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
                UniquesResponse resp = new UniquesResponse(total, pageNum, pageSize, results, warning);
                out.write(om.writeValueAsBytes(Map.of("type", "done", "result", resp)));
                out.write('\n');
                out.flush();
            } catch (Exception e) {
                if (e instanceof UncheckedIOException u) {
                    throw u;
                }
                throw new RuntimeException(e);
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
        return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_TYPE, "application/x-ndjson; charset=utf-8")
                .body(stream);
    }

    private static String dupUniqCacheKey(String primaryTrimmed, Set<String> compareSet, String queryVal) {
        return "dupuniq:" + primaryTrimmed + ":"
                + compareSet.stream().sorted().collect(Collectors.joining(",")) + ":" + queryVal;
    }

    private static List<DuplicateMatchRow> trimDuplicateMatches(List<DuplicateMatchRow> rows, int maxMatches) {
        if (maxMatches >= 50) {
            return rows;
        }
        return rows.stream()
                .map(row -> new DuplicateMatchRow(row.primary(),
                        row.matches().size() <= maxMatches ? row.matches() : row.matches().stream().limit(maxMatches).toList()))
                .toList();
    }

    private static double maxDuplicateRowScore(DuplicateMatchRow row) {
        if (row.matches() == null || row.matches().isEmpty()) {
            return 0.0;
        }
        return row.matches().stream().mapToDouble(ScoredSearchResult::score).max().orElse(0.0);
    }

    private static Comparator<DuplicateMatchRow> duplicatesComparatorFor(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "title" -> Comparator.comparing(
                    r -> r.primary().title() != null ? r.primary().title().toLowerCase() : "");
            case "trove" -> Comparator.comparing(
                    r -> r.primary().trove() != null ? r.primary().trove().toLowerCase() : "");
            case "score" -> Comparator.comparingDouble(SearchController::maxDuplicateRowScore);
            default -> null;
        };
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
            case "thumb" -> Comparator.comparing(SearchController::hasRealThumbnail).reversed();
            default -> null;
        };
    }

    /** True if the result has a real thumbnail (non-blank, not the Amazon placeholder, and does not contain "/no_image"). Rows with real thumbnails sort before pop-out-only rows (asc = real first, pop-out last). */
    private static boolean hasRealThumbnail(SearchResultWithScore r) {
        return r.result().hasThumbnail();
    }
}

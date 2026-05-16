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
import java.util.ArrayList;
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
            @RequestParam(required = false) String requireFileTypes,
            @RequestParam(required = false, defaultValue = "false") boolean thumbs,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "500") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortDir) {
        page = Math.max(0, page);
        size = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        String boostVal = boostTrove != null && !boostTrove.isBlank() ? boostTrove.trim() : "";

        // Expand explicitly requested troves to include any registered local sister ephemeral troves.
        final List<String> effectiveTroves;
        final List<String> caveats;
        if (trove != null && !trove.isEmpty()) {
            List<String> expanded = new ArrayList<>(trove);
            List<String> caveatMessages = new ArrayList<>();
            for (String t : trove) {
                if (t == null) {
                    continue;
                }
                List<String> sisterIds = searchDataService.getSisterEphemeralTroveIds(t);
                for (String sisterEphemeralId : sisterIds) {
                    expanded.add(sisterEphemeralId);
                    String sisterName = searchDataService.getEphemeralTroveDisplayName(sisterEphemeralId);
                    caveatMessages.add("Also searched local directory \"" + sisterName + "\" as sister of \"" + t + "\"");
                }
            }
            if (!caveatMessages.isEmpty()) {
                effectiveTroves = List.copyOf(expanded);
                caveats = List.copyOf(caveatMessages);
            } else {
                effectiveTroves = trove;
                caveats = null;
            }
        } else {
            effectiveTroves = trove;
            caveats = null;
        }

        String cacheKey = "s:" + (query != null ? query.trim() : "") + ":"
                + (effectiveTroves != null ? effectiveTroves.stream().filter(t -> t != null).sorted().collect(Collectors.joining(",")) : "") + ":b:" + boostVal;
        String queryVal = query != null ? query.trim() : "";
        boolean isWildcard = "*".equals(queryVal) || queryVal.isEmpty();
        SearchCache.CacheResult<ScoredSearchResult> cacheResult = searchCache.getOrCompute(cacheKey, () -> searchDataService.search(effectiveTroves, query, boostVal.isEmpty() ? null : boostVal));
        List<ScoredSearchResult> scored = cacheResult.data();
        List<SearchResultWithScore> all = scored.stream()
                .map(ss -> new SearchResultWithScore(ss.result(), isWildcard ? null : ss.score()))
                .toList();
        String sortByVal = sortBy != null && !sortBy.isBlank() ? sortBy.trim() : null;
        String sortDirVal = sortDir != null && !sortDir.isBlank() ? sortDir.trim() : null;
        boolean sortRequested = sortByVal != null || sortDirVal != null;
        boolean descending = "desc".equalsIgnoreCase(sortDirVal != null ? sortDirVal : "asc");
        if (sortRequested) {
            String effectiveSortBy = sortByVal != null ? sortByVal : "score";
            Comparator<SearchResultWithScore> cmp;
            if (effectiveSortBy.regionMatches(true, 0, EXTRA_SORT_PREFIX, 0, EXTRA_SORT_PREFIX.length())) {
                cmp = comparatorForExtraFieldSort(effectiveSortBy, descending);
            } else {
                cmp = comparatorForWithScore(effectiveSortBy);
                if (cmp != null && descending) {
                    cmp = cmp.reversed();
                }
            }
            if (cmp != null) {
                all = all.stream().sorted(cmp).toList();
            }
        }
        // Selected file types: by default disjunction (OR). Types listed in requireFileTypes must also match (AND).
        // Accept comma-separated (e.g. fileTypes=MP3,PDF&requireFileTypes=PDF) so all values are reliably received.
        List<String> fileTypesFilter = fileTypes != null && !fileTypes.isBlank()
                ? java.util.Arrays.stream(fileTypes.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isBlank())
                        .toList()
                : List.of();
        List<String> requireParsed = requireFileTypes != null && !requireFileTypes.isBlank()
                ? java.util.Arrays.stream(requireFileTypes.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isBlank())
                        .toList()
                : List.of();
        if (!fileTypesFilter.isEmpty()) {
            Set<String> sUpper = fileTypesFilter.stream().map(String::toUpperCase).collect(Collectors.toSet());
            Set<String> rUpper = requireParsed.stream().map(String::toUpperCase).filter(sUpper::contains).collect(Collectors.toSet());
            Set<String> optionalUpper = sUpper.stream().filter(t -> !rUpper.contains(t)).collect(Collectors.toSet());
            all = all.stream()
                    .filter(r -> {
                        SearchResult res = r.result();
                        if (!rUpper.isEmpty() && !FileTypeCounts.hasFileWithAllExtensions(res, rUpper)) {
                            return false;
                        }
                        if (optionalUpper.isEmpty()) {
                            return true;
                        }
                        return FileTypeCounts.hasFileWithAnyExtension(res, optionalUpper);
                    })
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
        List<String> availableExtraFieldKeys = collectAvailableExtraFieldKeys(all);
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<SearchResultWithScore> pageResults = from < to ? all.subList(from, to) : List.of();
        String warning = cacheResult.cached() ? null : "Result not cached (cache memory limit reached). Pagination may be slower.";
        return new SearchResponse(total, pageResults, page, size, troveCounts, availableFileTypes, fileTypeCounts, availableExtraFieldKeys, warning, caveats);
    }

    /** Distinct {@link SearchResult#extraFields()} keys across the full filtered result set (before pagination), for gallery sort. */
    private static List<String> collectAvailableExtraFieldKeys(List<SearchResultWithScore> all) {
        TreeSet<String> keys = new TreeSet<>();
        boolean hasLittlePrince = false;
        for (SearchResultWithScore rw : all) {
            SearchResult r = rw.result();
            if (r == null) {
                continue;
            }
            if ("littlePrinceItem".equals(r.itemType())) {
                hasLittlePrince = true;
            }
            Map<String, Object> ex = r.extraFields();
            if (ex != null && !ex.isEmpty()) {
                keys.addAll(ex.keySet());
            }
        }
        if (hasLittlePrince) {
            keys.add("lpid");
            keys.add("tintenfassId");
        }
        return List.copyOf(keys);
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
                        row.matches().size() <= maxMatches ? row.matches() : row.matches().stream().limit(maxMatches).toList(),
                        row.rerank()))
                .toList();
    }

    private static String duplicateRowRerank(DuplicateMatchRow row) {
        return row != null ? row.rerank() : null;
    }

    private static int rerankTier(DuplicateMatchRow row) {
        String rerank = duplicateRowRerank(row);
        if (rerank == null || rerank.isBlank()) {
            return 9;
        }
        int dot = rerank.indexOf('.');
        String tierPart = dot >= 0 ? rerank.substring(0, dot) : rerank;
        try {
            return Integer.parseInt(tierPart);
        } catch (NumberFormatException e) {
            return 9;
        }
    }

    private static int rerankRank(DuplicateMatchRow row) {
        String rerank = duplicateRowRerank(row);
        if (rerank == null || rerank.isBlank()) {
            return Integer.MAX_VALUE;
        }
        int dot = rerank.indexOf('.');
        if (dot < 0 || dot + 1 >= rerank.length()) {
            return Integer.MAX_VALUE;
        }
        try {
            return Integer.parseInt(rerank.substring(dot + 1));
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    private static Comparator<DuplicateMatchRow> duplicatesComparatorFor(String sortBy) {
        return switch (sortBy.toLowerCase()) {
            case "title" -> Comparator.comparing(
                    r -> r.primary().title() != null ? r.primary().title().toLowerCase() : "");
            case "trove" -> Comparator.comparing(
                    r -> r.primary().trove() != null ? r.primary().trove().toLowerCase() : "");
                case "rerank" -> Comparator
                    .comparingInt(SearchController::rerankTier)
                    .thenComparingInt(SearchController::rerankRank);
            case "score" -> Comparator.comparingDouble(r -> {
                if (r.matches() == null || r.matches().isEmpty()) {
                    return 0.0;
                }
                return r.matches().stream().mapToDouble(ScoredSearchResult::score).max().orElse(0.0);
            });
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

    private static final String EXTRA_SORT_PREFIX = "extra:";

    /**
     * Sort by an extra JSON key: rows with no value (missing / blank) always sort after rows with a value,
     * for both ascending and descending string order (reversing the whole comparator would put nulls first).
     */
    private static Comparator<SearchResultWithScore> comparatorForExtraFieldSort(String sortBy, boolean descending) {
        String jsonKey = sortBy.substring(EXTRA_SORT_PREFIX.length()).trim();
        if (jsonKey.isEmpty()) {
            return null;
        }
        Comparator<String> byString = descending
                ? String.CASE_INSENSITIVE_ORDER.reversed()
                : String.CASE_INSENSITIVE_ORDER;
        return Comparator
                .comparing((SearchResultWithScore r) -> extraFieldValueForSort(r.result(), jsonKey) == null)
                .thenComparing(r -> extraFieldValueForSort(r.result(), jsonKey), Comparator.nullsLast(byString));
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

    /** String form of one extra field for sorting; blank/whitespace is treated as missing (sorts last). */
    private static String extraFieldValueForSort(SearchResult r, String jsonKey) {
        Map<String, Object> ex = r.extraFields();
        if (ex == null) {
            return null;
        }
        Object v = ex.get(jsonKey);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v);
        if (s.isBlank()) {
            return null;
        }
        return s;
    }

    /** True if the result has a real thumbnail (non-blank, not the Amazon placeholder, and does not contain "/no_image"). Rows with real thumbnails sort before pop-out-only rows (asc = real first, pop-out last). */
    private static boolean hasRealThumbnail(SearchResultWithScore r) {
        return r.result().hasThumbnail();
    }
}

package com.example.morsor;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class SearchController {

    private final SearchDataService searchDataService;

    public SearchController(SearchDataService searchDataService) {
        this.searchDataService = searchDataService;
    }

    @GetMapping("/troves")
    public List<TroveOption> troves() {
        return searchDataService.getTroveOptions();
    }

    private static final int DEFAULT_PAGE_SIZE = 500;
    private static final int MAX_PAGE_SIZE = 10_000;

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam(required = false) List<String> trove,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "500") int size,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false, defaultValue = "asc") String sortDir) {
        page = Math.max(0, page);
        size = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        List<SearchResult> all = searchDataService.search(trove, query);
        boolean descending = "desc".equalsIgnoreCase(sortDir != null ? sortDir : "asc");
        if (sortBy != null && !sortBy.isBlank()) {
            Comparator<SearchResult> cmp = comparatorFor(sortBy);
            if (cmp != null) {
                if (descending) cmp = cmp.reversed();
                all = all.stream().sorted(cmp).toList();
            }
        }
        long total = all.size();
        Map<String, Long> troveCounts = all.stream()
                .filter(r -> r.troveId() != null && !r.troveId().isBlank())
                .collect(Collectors.groupingBy(SearchResult::troveId, Collectors.counting()));
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<SearchResult> pageResults = from < to ? all.subList(from, to) : List.of();
        return new SearchResponse(total, pageResults, page, size, troveCounts);
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
}

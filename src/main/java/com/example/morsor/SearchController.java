package com.example.morsor;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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
            @RequestParam(required = false, defaultValue = "500") int size) {
        page = Math.max(0, page);
        size = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        List<SearchResult> all = searchDataService.search(trove, query);
        long total = all.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + size, total);
        List<SearchResult> pageResults = from < to ? all.subList(from, to) : List.of();
        return new SearchResponse(total, pageResults, page, size);
    }
}

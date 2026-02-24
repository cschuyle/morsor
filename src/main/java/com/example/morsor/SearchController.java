package com.example.morsor;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class SearchController {

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam String trove,
            @RequestParam String query) {
        List<SearchResult> results = List.of(
                new SearchResult("1", "First result for " + query, "A snippet from the first result in " + trove + ".", trove),
                new SearchResult("2", "Second result for " + query, "Another snippet in " + trove + " matching your search.", trove),
                new SearchResult("3", "Third result", "Third canned snippet in " + trove + ".", trove)
        );
        return new SearchResponse(results.size(), results);
    }
}

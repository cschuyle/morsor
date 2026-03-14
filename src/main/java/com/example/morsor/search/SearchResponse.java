package com.example.morsor.search;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes, Map<String, Long> fileTypeCounts, String warning) {
    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes, String warning) {
        this(count, results, page, size, troveCounts, availableFileTypes, null, warning);
    }

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes) {
        this(count, results, page, size, troveCounts, availableFileTypes, null, null);
    }

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts) {
        this(count, results, page, size, troveCounts, null, null, null);
    }
}

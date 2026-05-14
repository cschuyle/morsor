package com.example.morsor.search;

import java.util.List;
import java.util.Map;

public record SearchResponse(
        long count,
        List<SearchResultWithScore> results,
        int page,
        int size,
        Map<String, Long> troveCounts,
        List<String> availableFileTypes,
        Map<String, Long> fileTypeCounts,
        List<String> availableExtraFieldKeys,
        String warning,
        /** Informational messages about implicit search expansions (e.g. sister troves included). Null when none. */
        List<String> caveats) {

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes, Map<String, Long> fileTypeCounts, String warning) {
        this(count, results, page, size, troveCounts, availableFileTypes, fileTypeCounts, List.of(), warning, null);
    }

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes, String warning) {
        this(count, results, page, size, troveCounts, availableFileTypes, null, List.of(), warning, null);
    }

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts, List<String> availableFileTypes) {
        this(count, results, page, size, troveCounts, availableFileTypes, null, List.of(), null, null);
    }

    public SearchResponse(long count, List<SearchResultWithScore> results, int page, int size, Map<String, Long> troveCounts) {
        this(count, results, page, size, troveCounts, null, null, List.of(), null, null);
    }
}

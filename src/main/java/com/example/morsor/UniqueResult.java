package com.example.morsor;

import java.util.List;

/**
 * A primary item with no match in compare troves, plus its "nearest miss" score and top near-miss matches for the UI.
 */
public record UniqueResult(SearchResult item, double score, List<ScoredSearchResult> nearMisses) {
    public UniqueResult(SearchResult item, double score) {
        this(item, score, List.of());
    }
}

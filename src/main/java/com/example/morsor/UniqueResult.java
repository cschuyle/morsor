package com.example.morsor;

/**
 * A primary item with no match in compare troves, plus its "nearest miss" similarity score (for ranking).
 */
public record UniqueResult(SearchResult item, double score) {}

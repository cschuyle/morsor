package com.example.morsor;

import java.util.List;

public record SearchResponse(long count, List<SearchResult> results, int page, int size) {}

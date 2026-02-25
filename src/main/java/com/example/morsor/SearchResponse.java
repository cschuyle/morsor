package com.example.morsor;

import java.util.List;
import java.util.Map;

public record SearchResponse(long count, List<SearchResult> results, int page, int size, Map<String, Long> troveCounts) {}

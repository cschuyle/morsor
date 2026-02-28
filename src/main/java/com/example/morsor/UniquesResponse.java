package com.example.morsor;

import java.util.List;

public record UniquesResponse(long total, int page, int size, List<SearchResult> results) {}

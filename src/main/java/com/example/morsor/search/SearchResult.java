package com.example.morsor.search;

import java.util.List;

public record SearchResult(
        String id,
        String title,
        String snippet,
        String trove,
        String troveId,
        boolean hasThumbnail,
        String thumbnailUrl,
        String largeImageUrl,
        List<String> files,
        String itemType,
        String itemUrl,
        String rawSourceItem) {}

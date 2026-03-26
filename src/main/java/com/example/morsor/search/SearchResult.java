package com.example.morsor.search;

import java.util.List;

public record SearchResult(
        String id,
        String itemType,
        String title,
        String snippet,
        String trove,
        String troveId,
        boolean hasThumbnail,
        String thumbnailUrl,
        String largeImageUrl,
        List<String> files,
        // itemType Amazon wish list item - at least that's where it came from
        String itemUrl,
        // itemType "domain"
        String domainName,
        String punycodeDomainName,
        String expirationDate,
        Boolean autoRenew,
        String rawSourceItem
) {}

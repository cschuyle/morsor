package com.example.morsor.search;

import java.util.List;
import java.util.Map;

public record SearchResult(
        String id,
        String itemType, // littlePrinceItem, domain, movie
        String title,
        String snippet, // TODO This isn't really being used properly yet. Is this description, or is this a generated synopsis built by the server?
        String trove,
        String troveId,
        boolean hasThumbnail, // TODO Why do I need this and thumbnailUrl?
        String thumbnailUrl,
        String largeImageUrl,
        String rawSourceItem, // Original JSON
        List<String> files,
        // itemType Amazon wish list item - at least that's where it came from
        String itemUrl,
        /**
         * The following four fields apply only when {@code itemType} is {@code "domain"} (Namecheap-style S3 JSON).
         * They are null for other item types.
         */
        String domainName,
        String punycodeDomainName,
        String expirationDate,
        Boolean autoRenew,
        /**
         * When {@code itemType} is {@code "littlePrinceItem"}, extra fields from the source object that are not
         * already exposed as top-level properties (author, language, isbn, etc.). Null for other item types.
         */
        Map<String, Object> littlePrinceItemExtra
) {}

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
         * Fields from the source item JSON that are not mapped onto this record (any {@code itemType}). For example
         * author, language, isbn, {@code domain-name} / {@code expiration-date} for domains; vendor-specific ids
         * ({@code lpid}, {@code tintenfassId}, etc.) stay here and must not be used as {@link #id()}. Null when empty.
         */
        Map<String, Object> extraFields
) {}

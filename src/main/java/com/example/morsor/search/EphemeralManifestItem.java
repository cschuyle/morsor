package com.example.morsor.search;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * One row in a CLI-uploaded ephemeral trove manifest. Server fills {@link SearchResult#troveId()} and
 * {@link SearchResult#trove()}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EphemeralManifestItem(
        String id,
        String title,
        String snippet,
        List<String> files,
        String itemType,
        String itemUrl,
        Map<String, Object> extraFields
) {}

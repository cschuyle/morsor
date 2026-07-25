package com.example.morsor.search;

import java.util.List;

/**
 * Result of bulk-loading titles into a dynamic trove. {@code duplicates} are titles from the
 * request that were skipped because their normalized form already existed in the trove (including
 * titles added earlier in the same request).
 */
public record DynamicTroveItemBulkLoadResult(
        String troveId,
        int loaded,
        List<String> added,
        List<String> duplicates
) {}

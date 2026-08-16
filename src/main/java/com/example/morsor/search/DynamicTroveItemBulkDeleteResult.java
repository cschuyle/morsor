package com.example.morsor.search;

import java.util.List;

/**
 * Result of bulk-removing titles from a dynamic trove. {@code notFound} are titles from the
 * request whose normalized form didn't match any item currently in the trove.
 */
public record DynamicTroveItemBulkDeleteResult(
        String troveId,
        int removed,
        List<String> removedTitles,
        List<String> notFound
) {}

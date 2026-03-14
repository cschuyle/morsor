package com.example.morsor.search;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Utilities for counting and matching file types in search results.
 * Used by SearchController for filtering and for hit counts per type in the response.
 */
public final class FileTypeCounts {

    private FileTypeCounts() {}

    /**
     * Count how many results have each file type (for dropdown hit counts).
     * An item with both PDF and JPG is counted in both PDF and JPG.
     */
    public static Map<String, Long> countPerFileType(List<SearchResultWithScore> results) {
        List<String> types = collectFileTypes(results);
        Map<String, Long> out = new LinkedHashMap<>();
        for (String type : types) {
            long c;
            if ("Link".equals(type) || "URL".equalsIgnoreCase(type)) {
                c = results.stream()
                        .filter(r -> r.result().itemUrl() != null && !r.result().itemUrl().isBlank())
                        .count();
            } else {
                Set<String> one = Set.of(type);
                c = results.stream()
                        .filter(r -> hasFileWithAnyExtension(r.result(), one))
                        .count();
            }
            out.put(type, c);
        }
        return out;
    }

    /** Returns true if the result has at least one file with an extension in the set, or has itemUrl when "Link"/"URL" is requested. */
    public static boolean hasFileWithAnyExtension(SearchResult result, Set<String> extensions) {
        if (extensions == null || extensions.isEmpty()) return false;
        if ((extensions.contains("LINK") || extensions.contains("URL")) && result.itemUrl() != null && !result.itemUrl().isBlank()) return true;
        if (result.files() == null) return false;
        for (String url : result.files()) {
            if (url != null) {
                String ext = extractExtension(url);
                if (ext != null && extensions.contains(ext)) return true;
            }
        }
        return false;
    }

    public static String extractExtension(String url) {
        if (url == null) return null;
        int q = url.indexOf('?');
        String path = q >= 0 ? url.substring(0, q) : url;
        int lastDot = path.lastIndexOf('.');
        if (lastDot >= 0 && lastDot < path.length() - 1) {
            return path.substring(lastDot + 1).toUpperCase();
        }
        return null;
    }

    public static List<String> collectFileTypes(List<SearchResultWithScore> results) {
        Set<String> types = new TreeSet<>();
        for (SearchResultWithScore r : results) {
            if (r.result().itemUrl() != null && !r.result().itemUrl().isBlank()) types.add("Link");
            if (r.result().files() != null) {
                for (String url : r.result().files()) {
                    String ext = extractExtension(url);
                    if (ext != null && !ext.isEmpty()) types.add(ext);
                }
            }
        }
        return List.copyOf(types);
    }
}

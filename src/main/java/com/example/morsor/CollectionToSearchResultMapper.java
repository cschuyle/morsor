package com.example.morsor;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.StreamSupport;

/**
 * Maps collection JSON into {@link SearchResult} for search. Supports:
 * <ul>
 *   <li>Items format: {@code { "id", "name", "shortName", "items": [ { "littlePrinceItem": { ... } }, ... ] }}</li>
 *   <li>Titles format: {@code { "id", "name", "shortName", "titles": [ "Title 1", "Title 2", ... ] }}</li>
 *   <li>Array of collections (either format): {@code [ { ... }, ... ]}</li>
 * </ul>
 */
public final class CollectionToSearchResultMapper {

    private CollectionToSearchResultMapper() {}

    /**
     * Map a root node to search results. Detects format per collection (items vs titles).
     */
    public static List<SearchResult> mapRootToSearchResults(JsonNode root) {
        List<SearchResult> out = new ArrayList<>();
        if (root == null || root.isNull()) {
            return out;
        }
        if (root.isArray()) {
            StreamSupport.stream(root.spliterator(), false)
                    .forEach(collectionNode -> addCollectionResults(collectionNode, out));
        } else {
            addCollectionResults(root, out);
        }
        return out;
    }

    private static void addCollectionResults(JsonNode collectionNode, List<SearchResult> out) {
        String troveId = text(collectionNode, "id");
        String troveName = text(collectionNode, "shortName");
        if (troveName == null || troveName.isEmpty()) {
            troveName = text(collectionNode, "name");
        }
        if (troveName == null || troveName.isEmpty()) {
            troveName = troveId;
        }

        JsonNode titles = collectionNode.get("titles");
        if (titles != null && titles.isArray()) {
            addTitlesCollectionResults(troveId, troveName, titles, out);
            return;
        }

        JsonNode items = collectionNode.get("items");
        if (items == null || !items.isArray()) {
            return;
        }
        int index = 0;
        for (JsonNode itemWrapper : items) {
            if (!itemWrapper.isObject()) continue;
            JsonNode item = unwrapItem(itemWrapper);
            if (item == null) continue;
            SearchResult r = mapItemToSearchResult(item, troveName, troveId, index);
            if (r != null) {
                out.add(r);
            }
            index++;
        }
    }

    /** Map a collection with "titles": [ "Title 1", "Title 2", ... ] to one SearchResult per title. */
    private static void addTitlesCollectionResults(String troveId, String troveName, JsonNode titlesArray, List<SearchResult> out) {
        for (int i = 0; i < titlesArray.size(); i++) {
            JsonNode titleNode = titlesArray.get(i);
            String title = titleNode != null && titleNode.isTextual() ? titleNode.asText() : (titleNode != null ? titleNode.toString() : "");
            String id = troveId != null && !troveId.isEmpty() ? troveId + "-" + i : "trove-" + i;
            out.add(new SearchResult(id, title, title, troveName, troveId));
        }
    }

    /** Each item is an object with one key (e.g. "littlePrinceItem") whose value is the actual item. */
    private static JsonNode unwrapItem(JsonNode itemWrapper) {
        var it = itemWrapper.fields();
        if (!it.hasNext()) return null;
        return it.next().getValue();
    }

    private static SearchResult mapItemToSearchResult(JsonNode item, String troveName, String troveId, int index) {
        String id = text(item, "lpid");
        if (id == null || id.isEmpty()) {
            id = text(item, "id");
        }
        if (id == null || id.isEmpty()) {
            id = troveId + "-" + index;
        }

        String title = text(item, "display-title");
        if (title == null || title.isEmpty()) {
            title = text(item, "title");
        }
        if (title == null) {
            title = "";
        }

        String snippet = buildSnippet(item);

        return new SearchResult(id, title, snippet, troveName, troveId);
    }

    private static String buildSnippet(JsonNode item) {
        List<String> parts = new ArrayList<>();
        String language = text(item, "language");
        if (language != null && !language.isEmpty()) {
            parts.add(language);
        }
        String author = text(item, "author");
        if (author != null && !author.isEmpty()) {
            parts.add(author);
        }
        String year = text(item, "year");
        if (year != null && !year.isEmpty()) {
            parts.add(year);
        }
        String searchWords = text(item, "search-words");
        if (searchWords != null && !searchWords.isEmpty()) {
            parts.add(searchWords);
        }
        if (parts.isEmpty()) {
            return text(item, "title");
        }
        return String.join(" · ", parts);
    }

    private static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return null;
        if (!v.isTextual()) return v.toString();
        return v.asText();
    }
}

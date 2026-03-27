package com.example.morsor.search;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;

/**
 * Maps collection JSON into {@link SearchResult} for search. Supports:
 *
 * Little Prince Items format:
 * { "id", "name", "shortName", "items": [ { "littlePrinceItem": { ... } }, ... ] }}
 *
 * Movie/Screening Items format:
 * { "id", "name", "shortName", "items": [ { "movie": { "title", "year", "director" } }, ... ] }}
 *
 * Domains Items format:
 * { "id", "name", "shortName", "items": [ { "domain": { "domain-name", "title", ... } }, ... ] }}
 *
 * Titles format:
 * { "id", "name", "shortName", "titles": [ "Title 1", "Title 2", ... ] }
 *
 */
public final class CollectionToSearchResultMapper {
    private static final String AMAZON_PLACEHOLDER_THUMB = "https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif";
    private static final ObjectMapper PRETTY_MAPPER = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    /**
     * Keys already represented on {@link SearchResult} for little-prince items, or otherwise omitted from {@code
     * littlePrinceItemExtra}. Vendor-specific identifiers ({@code lpid}, {@code tintenfassId}, {@code asin}, etc.) are
     * <strong>not</strong> listed here so they remain in {@code littlePrinceItemExtra} and must never be used as
     * {@link SearchResult#id()}.
     */
    private static final Set<String> LITTLE_PRINCE_TOP_LEVEL_KEYS = Set.of(
            "_itemType",
            "id",
            "display-title",
            "title",
            "smallImageUrl",
            "largeImageUrl",
            "files",
            "itemUrl");

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
            if (!itemWrapper.isObject()) {
                continue;
            }
            String rawSourceItem = toRawSourceItem(itemWrapper);
            JsonNode item = unwrapItem(itemWrapper);
            if (item == null) {
                continue;
            }
            SearchResult r = mapItemToSearchResult(item, rawSourceItem, troveName, troveId, index);
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
            String rawSourceItem = toRawSourceItem(titleNode);
            String id = troveId != null && !troveId.isEmpty() ? troveId + "-" + i : "trove-" + i;
            out.add(new SearchResult(id, null, title, title, troveName, troveId, false, null, null, rawSourceItem, List.of(), null, null, null, null, null, null));
        }
    }

    /** Each item is an object with one key (e.g. "littlePrinceItem") whose value is the actual item. */
    private static JsonNode unwrapItem(JsonNode itemWrapper) {
        var it = itemWrapper.fields();
        if (!it.hasNext()) {
            return null;
        }
        var entry = it.next();
        JsonNode value = entry.getValue();
        if (value != null && value.isObject()) {
            ((ObjectNode) value).put("_itemType", entry.getKey());
        }
        return value;
    }

    /**
     * Serialize the node to a string for rawSourceItem. Uses pretty-printed JSON for objects/arrays
     * so all fields are included. For primitives (string, number, etc.) returns the value.
     * Never returns null.
     */
    private static String toRawSourceItem(JsonNode node) {
        if (node == null || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText();
        }
        try {
            return PRETTY_MAPPER.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            return node.toString();
        }
    }

    private static SearchResult mapItemToSearchResult(JsonNode item, String rawSourceItem, String troveName, String troveId, int index) {
        // SearchResult.id: ONLY the JSON property named exactly "id". Do not fall back to lpid, tintenfassId, or any
        // other *Id field—those stay in littlePrinceItemExtra / raw JSON unless product owner approves otherwise.
        String id = text(item, "id");
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
        String thumbnailUrl = text(item, "smallImageUrl");
        boolean hasThumbnail = hasRealThumbnail(thumbnailUrl);
        String largeImageUrl = text(item, "largeImageUrl");
        List<String> files = textArray(item, "files");
        String itemTypeRaw = text(item, "_itemType");
        String itemType = itemTypeRaw;
        String itemUrl = null;
        String domainName = null;
        String punycodeDomainName = null;
        String expirationDate = null;
        Boolean autoRenew = null;
        Map<String, Object> littlePrinceItemExtra = null;

        if ("littlePrinceItem".equals(itemTypeRaw)) {
            itemUrl = text(item, "itemUrl");
            littlePrinceItemExtra = buildLittlePrinceItemExtra(item);
            littlePrinceItemExtra = mergeLpidIntoLittlePrinceItemExtra(item, littlePrinceItemExtra);
        } else if ("domain".equals(itemTypeRaw)) {
            domainName = text(item, "domain-name");
            punycodeDomainName = text(item, "punycode-domain-name");
            expirationDate = text(item, "expiration-date");
            String autoRenewStr = text(item, "auto-renew");
            if (autoRenewStr != null) {
                String v = autoRenewStr.trim();
                if ("true".equalsIgnoreCase(v)) autoRenew = true;
                else if ("false".equalsIgnoreCase(v)) autoRenew = false;
            }
        }

        return new SearchResult(id, itemType, title, snippet, troveName, troveId, hasThumbnail, thumbnailUrl, largeImageUrl, rawSourceItem, files, itemUrl, domainName, punycodeDomainName, expirationDate, autoRenew, littlePrinceItemExtra);
    }

    /**
     * Ensures {@code lpid} from the source JSON is present in {@code littlePrinceItemExtra} when the field exists.
     * It is not a {@link SearchResult#id()} and is not in {@link #LITTLE_PRINCE_TOP_LEVEL_KEYS}, so it normally appears
     * via {@link #buildLittlePrinceItemExtra}; this merge guarantees it is never dropped if that set is edited.
     */
    private static Map<String, Object> mergeLpidIntoLittlePrinceItemExtra(JsonNode item, Map<String, Object> extra) {
        if (item == null || !item.isObject()) {
            return extra;
        }
        JsonNode lpidNode = item.get("lpid");
        if (lpidNode == null || lpidNode.isNull()) {
            return extra;
        }
        Object lpidVal = PRETTY_MAPPER.convertValue(lpidNode, Object.class);
        Map<String, Object> out = extra != null ? new LinkedHashMap<>(extra) : new LinkedHashMap<>();
        out.put("lpid", lpidVal);
        return out;
    }

    /**
     * Remaining JSON properties for a little-prince item (everything not already mapped onto {@link SearchResult}).
     */
    private static Map<String, Object> buildLittlePrinceItemExtra(JsonNode item) {
        if (item == null || !item.isObject()) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> it = item.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            if (LITTLE_PRINCE_TOP_LEVEL_KEYS.contains(e.getKey())) {
                continue;
            }
            Object javaVal = PRETTY_MAPPER.convertValue(e.getValue(), Object.class);
            out.put(e.getKey(), javaVal);
        }
        return out.isEmpty() ? null : out;
    }

    private static boolean hasRealThumbnail(String thumbnailUrl) {
        if (thumbnailUrl == null) {
            return false;
        }
        String normalized = thumbnailUrl.trim();
        return !normalized.isEmpty()
                && !AMAZON_PLACEHOLDER_THUMB.equals(normalized)
                && !normalized.contains("/no_image");
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
        String director = text(item, "director");
        if (director != null && !director.isEmpty()) {
            parts.add(director);
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
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        if (!v.isTextual()) {
            return v.toString();
        }
        return v.asText();
    }

    private static List<String> textArray(JsonNode node, String field) {
        if (node == null) {
            return List.of();
        }
        JsonNode arr = node.get(field);
        if (arr == null || !arr.isArray() || arr.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>(arr.size());
        for (JsonNode v : arr) {
            if (v == null || v.isNull()) {
                continue;
            }
            if (v.isTextual()) {
                out.add(v.asText());
            } else {
                out.add(v.toString());
            }
        }
        return out;
    }
}

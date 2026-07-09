package com.example.morsor.search;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * Parses {@code field:value} tokens from the user search string and filters
 * {@link SearchResult} rows. Recognized fields map to built-in record properties
 * (e.g. {@code title}) or selected extra fields (e.g. {@code languages}).
 * Unrecognized field names raise {@link InvalidSearchQueryException}.
 */
final class SearchFieldFilters {

    static final String LANGUAGES_FIELD = "languages";
    static final String COUNT_LANGUAGES_FIELD = "count(Languages)";

    private static final Set<String> KNOWN_CANONICAL_FIELDS = Set.of(
            LANGUAGES_FIELD,
            COUNT_LANGUAGES_FIELD,
            "title",
            "id",
            "itemType",
            "snippet",
            "trove",
            "troveId",
            "itemUrl");

    record FieldFilter(String fieldKey, String value) {}

    record ParsedQuery(String textQuery, List<FieldFilter> filters) {}

    private SearchFieldFilters() {}

    static ParsedQuery parse(String query) {
        if (query == null) {
            return new ParsedQuery("", List.of());
        }
        String trimmed = query.trim();
        if (trimmed.isEmpty()) {
            return new ParsedQuery("", List.of());
        }

        List<FieldFilter> filters = new ArrayList<>();
        Set<String> invalidFields = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        List<String> textParts = new ArrayList<>();

        for (String part : trimmed.split("\\s+")) {
            if (part == null || part.isBlank()) {
                continue;
            }
            if (!isFieldValueToken(part)) {
                textParts.add(part);
                continue;
            }
            int colon = part.indexOf(':');
            String rawField = part.substring(0, colon).trim();
            String value = part.substring(colon + 1).trim();
            if (rawField.isEmpty() || value.isEmpty()) {
                textParts.add(part);
                continue;
            }
            Optional<String> canonical = canonicalFieldKeyIfKnown(rawField);
            if (canonical.isEmpty()) {
                invalidFields.add(rawField);
                continue;
            }
            filters.add(new FieldFilter(canonical.get(), value));
        }

        if (!invalidFields.isEmpty()) {
            throw new InvalidSearchQueryException(
                    "Unknown search field(s): " + String.join(", ", invalidFields));
        }

        String text = String.join(" ", textParts).trim();
        if ("*".equals(text)) {
            text = "";
        }
        return new ParsedQuery(text, List.copyOf(filters));
    }

    static boolean matches(SearchResult result, List<FieldFilter> filters) {
        if (filters == null || filters.isEmpty()) {
            return true;
        }
        for (FieldFilter filter : filters) {
            if (!matchesOne(result, filter)) {
                return false;
            }
        }
        return true;
    }

    private static boolean isFieldValueToken(String token) {
        if (!token.contains(":") || token.contains("://")) {
            return false;
        }
        int colon = token.indexOf(':');
        return colon > 0 && colon < token.length() - 1;
    }

    private static boolean matchesOne(SearchResult result, FieldFilter filter) {
        return switch (filter.fieldKey()) {
            case LANGUAGES_FIELD -> matchesLanguage(result, filter.value());
            case COUNT_LANGUAGES_FIELD -> matchesCountLanguages(result, filter.value());
            case "title", "snippet", "trove", "itemType", "itemUrl" ->
                    matchesTextContains(builtinValue(result, filter.fieldKey()), filter.value());
            case "id", "troveId" -> matchesTextEquals(builtinValue(result, filter.fieldKey()), filter.value());
            default -> false;
        };
    }

    private static String builtinValue(SearchResult result, String fieldKey) {
        return switch (fieldKey) {
            case "title" -> result.title();
            case "id" -> result.id();
            case "itemType" -> result.itemType();
            case "snippet" -> result.snippet();
            case "trove" -> result.trove();
            case "troveId" -> result.troveId();
            case "itemUrl" -> result.itemUrl();
            default -> null;
        };
    }

    private static boolean matchesTextContains(String actual, String expected) {
        if (expected == null || expected.isBlank() || actual == null || actual.isBlank()) {
            return false;
        }
        return actual.toLowerCase(Locale.ROOT).contains(expected.trim().toLowerCase(Locale.ROOT));
    }

    private static boolean matchesTextEquals(String actual, String expected) {
        if (expected == null || expected.isBlank() || actual == null || actual.isBlank()) {
            return false;
        }
        return actual.trim().equalsIgnoreCase(expected.trim());
    }

    private static boolean matchesLanguage(SearchResult result, String expected) {
        if (expected == null || expected.isBlank()) {
            return false;
        }
        Object raw = extraFieldValue(result, LANGUAGES_FIELD);
        if (raw == null) {
            return false;
        }
        String want = expected.trim().toLowerCase(Locale.ROOT);
        if (raw instanceof Iterable<?> iterable) {
            for (Object elem : iterable) {
                if (elem != null && want.equals(String.valueOf(elem).trim().toLowerCase(Locale.ROOT))) {
                    return true;
                }
            }
            return false;
        }
        String text = String.valueOf(raw).trim();
        if (text.isEmpty()) {
            return false;
        }
        for (String part : text.split(",")) {
            if (want.equals(part.trim().toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private static boolean matchesCountLanguages(SearchResult result, String expected) {
        if (expected == null || expected.isBlank()) {
            return false;
        }
        final double want;
        try {
            want = Double.parseDouble(expected.trim());
        } catch (NumberFormatException e) {
            return false;
        }
        Object raw = extraFieldValue(result, COUNT_LANGUAGES_FIELD);
        if (!(raw instanceof Number number)) {
            return false;
        }
        return number.doubleValue() == want;
    }

    private static Object extraFieldValue(SearchResult result, String fieldKey) {
        Map<String, Object> ex = result.extraFields();
        if (ex == null || ex.isEmpty()) {
            return null;
        }
        if (ex.containsKey(fieldKey)) {
            return ex.get(fieldKey);
        }
        for (Map.Entry<String, Object> entry : ex.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(fieldKey)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static Optional<String> canonicalFieldKeyIfKnown(String field) {
        if (field == null || field.isBlank()) {
            return Optional.empty();
        }
        String lower = field.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "count(languages)" -> Optional.of(COUNT_LANGUAGES_FIELD);
            case "languages" -> Optional.of(LANGUAGES_FIELD);
            case "title" -> Optional.of("title");
            case "id" -> Optional.of("id");
            case "itemtype" -> Optional.of("itemType");
            case "snippet" -> Optional.of("snippet");
            case "trove" -> Optional.of("trove");
            case "troveid" -> Optional.of("troveId");
            case "itemurl" -> Optional.of("itemUrl");
            default -> Optional.empty();
        };
    }
}

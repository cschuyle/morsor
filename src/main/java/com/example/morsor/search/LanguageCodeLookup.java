package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Resolves ISO-style language codes to human-readable names using a configured reference trove
 * ({@code languageCode} items with {@code code}, {@code title}, and optional {@code aliases}).
 */
@Component
public class LanguageCodeLookup {

    private static final Logger log = LoggerFactory.getLogger(LanguageCodeLookup.class);

    public static final String DISPLAY_FIELD = "subtitles(display)";

    /** Substring matching for {@code subtitles:} requires at least this many characters in the filter term. */
    static final int MIN_LANGUAGE_FILTER_SUBSTRING_LENGTH = 3;

    @Value("${moocho.language.trove.id:iso639-languages}")
    private String languageTroveId;

    private volatile Map<String, String> codeToName = Map.of();

    public String getLanguageTroveId() {
        return languageTroveId != null ? languageTroveId.trim() : "";
    }

    public boolean isConfigured() {
        return !getLanguageTroveId().isEmpty();
    }

    public void rebuild(List<SearchResult> troveItems) {
        if (troveItems == null || troveItems.isEmpty()) {
            codeToName = Map.of();
            return;
        }
        Map<String, String> next = new LinkedHashMap<>();
        for (SearchResult item : troveItems) {
            if (item == null || !"languageCode".equals(item.itemType())) {
                continue;
            }
            Map<String, Object> extra = item.extraFields();
            if (extra == null) {
                continue;
            }
            String name = stringValue(extra.get("title"));
            if (name == null || name.isBlank()) {
                name = item.title();
            }
            if (name == null || name.isBlank()) {
                continue;
            }
            registerCode(next, stringValue(extra.get("code")), name);
            Object aliases = extra.get("aliases");
            if (aliases instanceof Iterable<?> iterable && !(aliases instanceof CharSequence)) {
                for (Object alias : iterable) {
                    registerCode(next, stringValue(alias), name);
                }
            } else if (aliases instanceof String aliasText && !aliasText.isBlank()) {
                for (String part : aliasText.split(",")) {
                    registerCode(next, part, name);
                }
            }
        }
        codeToName = Collections.unmodifiableMap(next);
        log.info("Language code lookup rebuilt: {} keys from {} trove items", next.size(), troveItems.size());
    }

    public int lookupSize() {
        return codeToName.size();
    }

    public String resolve(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String key = normalizeLookupKey(code);
        String name = codeToName.get(key);
        if (name != null) {
            return name;
        }
        int underscore = key.indexOf('_');
        if (underscore > 0) {
            name = codeToName.get(key.substring(0, underscore));
            if (name != null) {
                return name;
            }
        }
        int dash = key.indexOf('-');
        if (dash > 0) {
            return codeToName.get(key.substring(0, dash));
        }
        return null;
    }

    private static String normalizeLookupKey(String code) {
        return code.trim().toLowerCase(Locale.ROOT);
    }

    public List<String> resolveList(Object rawLanguages) {
        List<String> codes = normalizeLanguageCodes(rawLanguages);
        if (codes.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>(codes.size());
        for (String code : codes) {
            String name = resolve(code);
            out.add(name != null ? name : code);
        }
        return List.copyOf(out);
    }

    /**
     * True when {@code itemValue} (a raw code or display name on a result row) satisfies
     * {@code subtitles:filterTerm}. Supports exact code/name matches, lookup aliases, and
     * case-insensitive substring matches on codes and catalog display names.
     */
    public boolean languageFilterMatchesItemValue(String filterTerm, String itemValue) {
        if (filterTerm == null || filterTerm.isBlank() || itemValue == null || itemValue.isBlank()) {
            return false;
        }
        String needle = filterTerm.trim().toLowerCase(Locale.ROOT);
        String code = normalizeLookupKey(itemValue);
        String displayName = resolve(itemValue);
        String displayLower = displayName != null
                ? displayName.toLowerCase(Locale.ROOT)
                : itemValue.trim().toLowerCase(Locale.ROOT);

        if (needle.length() >= MIN_LANGUAGE_FILTER_SUBSTRING_LENGTH) {
            if (code.contains(needle) || displayLower.contains(needle)) {
                return true;
            }
        }
        if (languageValueMatchesFilterTerm(itemValue, expandLanguageFilterTerm(filterTerm))) {
            return true;
        }
        if (needle.length() >= MIN_LANGUAGE_FILTER_SUBSTRING_LENGTH) {
            for (Map.Entry<String, String> entry : codeToName.entrySet()) {
                String catalogCode = entry.getKey();
                String catalogNameLower = entry.getValue().toLowerCase(Locale.ROOT);
                if (!catalogCode.contains(needle) && !catalogNameLower.contains(needle)) {
                    continue;
                }
                if (code.equals(catalogCode)) {
                    return true;
                }
                if (displayName != null && displayName.equalsIgnoreCase(entry.getValue())) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Lowercase codes and display names that satisfy {@code subtitles:term} exactly — the term itself, any
     * codes that resolve to that display name, and the display name for that code when it is known.
     */
    public Set<String> expandLanguageFilterTerm(String term) {
        if (term == null || term.isBlank()) {
            return Set.of();
        }
        Set<String> out = new LinkedHashSet<>();
        String trimmed = term.trim();
        out.add(trimmed.toLowerCase(Locale.ROOT));
        out.add(normalizeLookupKey(trimmed));
        String resolvedName = resolve(trimmed);
        if (resolvedName != null) {
            out.add(resolvedName.toLowerCase(Locale.ROOT));
            for (Map.Entry<String, String> entry : codeToName.entrySet()) {
                if (entry.getValue().equalsIgnoreCase(resolvedName)) {
                    out.add(entry.getKey());
                }
            }
        }
        for (Map.Entry<String, String> entry : codeToName.entrySet()) {
            if (entry.getValue().equalsIgnoreCase(trimmed)) {
                out.add(entry.getKey());
            }
        }
        return Collections.unmodifiableSet(out);
    }

    /** True when {@code value} matches any token from {@link #expandLanguageFilterTerm(String)}. */
    public boolean languageValueMatchesFilterTerm(String value, Set<String> acceptableTokens) {
        if (value == null || value.isBlank() || acceptableTokens == null || acceptableTokens.isEmpty()) {
            return false;
        }
        String trimmed = value.trim();
        if (acceptableTokens.contains(trimmed.toLowerCase(Locale.ROOT))) {
            return true;
        }
        if (acceptableTokens.contains(normalizeLookupKey(trimmed))) {
            return true;
        }
        String resolved = resolve(trimmed);
        if (resolved != null && acceptableTokens.contains(resolved.toLowerCase(Locale.ROOT))) {
            return true;
        }
        return false;
    }

    public static List<String> normalizeLanguageCodes(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof Iterable<?> iterable && !(raw instanceof CharSequence)) {
            List<String> out = new ArrayList<>();
            for (Object elem : iterable) {
                String s = stringValue(elem);
                if (s != null && !s.isBlank()) {
                    out.add(s.trim());
                }
            }
            return List.copyOf(out);
        }
        String text = stringValue(raw);
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return List.copyOf(
                java.util.Arrays.stream(text.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList());
    }

    private static void registerCode(Map<String, String> map, String code, String name) {
        if (code == null || code.isBlank() || name == null || name.isBlank()) {
            return;
        }
        map.putIfAbsent(normalizeLookupKey(code), name.trim());
    }

    private static String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        return Objects.toString(value, null);
    }
}

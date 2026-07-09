package com.example.morsor.search;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LanguageCodeLookupTest {

    private LanguageCodeLookup lookup;

    @BeforeEach
    void setUp() {
        lookup = new LanguageCodeLookup();
        ReflectionTestUtils.setField(lookup, "languageTroveId", "iso639-languages");
    }

    @Test
    void resolvesTwoLetterCodesAndAliases() {
        lookup.rebuild(List.of(
                languageItem("de", "German", List.of("deu", "ger")),
                languageItem("en", "English", List.of("eng"))));

        assertThat(lookup.resolve("de")).isEqualTo("German");
        assertThat(lookup.resolve("DE")).isEqualTo("German");
        assertThat(lookup.resolve("deu")).isEqualTo("German");
        assertThat(lookup.resolve("eng")).isEqualTo("English");
    }

    @Test
    void languageFilterSubstringRequiresAtLeastThreeCharacters() {
        lookup.rebuild(List.of(
                languageItem("ru", "Russian", List.of("rus")),
                languageItem("ar", "Arabic", List.of("ara"))));
        assertThat(lookup.languageFilterMatchesItemValue("ru", "rus")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("ar", "ara")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("ru", "ara")).isFalse();
        assertThat(lookup.languageFilterMatchesItemValue("rus", "rus")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("ara", "xyz")).isFalse();
    }

    @Test
    void languageFilterMatchesItemValueBySubstring() {
        lookup.rebuild(List.of(
                languageItem("ru", "Russian", List.of("rus")),
                languageItem("ar", "Arabic", List.of("ara")),
                languageItem("mxi", "Mozarabic", List.of())));
        assertThat(lookup.languageFilterMatchesItemValue("russ", "rus")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("arab", "ara")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("arab", "mxi")).isTrue();
        assertThat(lookup.languageFilterMatchesItemValue("arab", "rus")).isFalse();
    }

    @Test
    void expandLanguageFilterTermIncludesCodeAndDisplayName() {
        lookup.rebuild(List.of(
                languageItem("de", "German", List.of("deu", "ger")),
                languageItem("ru", "Russian", List.of("rus"))));
        assertThat(lookup.expandLanguageFilterTerm("German"))
                .contains("german", "de", "deu", "ger");
        assertThat(lookup.expandLanguageFilterTerm("deu"))
                .contains("deu", "german");
    }

    @Test
    void resolveListUsesNameWhenKnownAndKeepsUnknownCodes() {
        lookup.rebuild(List.of(languageItem("de", "German", List.of()), languageItem("en", "English", List.of())));

        assertThat(lookup.resolveList(List.of("de", "en", "xyz"))).containsExactly("German", "English", "xyz");
    }

    @Test
    void rebuildWithEmptyItemsClearsLookup() {
        lookup.rebuild(List.of(languageItem("de", "German", List.of())));
        lookup.rebuild(List.of());
        assertThat(lookup.resolve("de")).isNull();
    }

    @Test
    void normalizeLanguageCodesSupportsCommaSeparatedString() {
        assertThat(LanguageCodeLookup.normalizeLanguageCodes("de, en ,es")).containsExactly("de", "en", "es");
    }

    private static SearchResult languageItem(String code, String title, List<String> aliases) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("code", code);
        extra.put("title", title);
        if (!aliases.isEmpty()) {
            extra.put("aliases", aliases);
        }
        return new SearchResult(
                "iso639-languages-" + code,
                "languageCode",
                title,
                title,
                "Languages",
                "iso639-languages",
                false,
                null,
                null,
                "{}",
                List.of(),
                null,
                extra);
    }
}

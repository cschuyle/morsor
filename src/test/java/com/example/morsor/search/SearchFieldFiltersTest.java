package com.example.morsor.search;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SearchFieldFiltersTest {

    private static LanguageCodeLookup lookupWithGermanAndRussian() {
        LanguageCodeLookup lookup = new LanguageCodeLookup();
        lookup.rebuild(List.of(
                languageItem("de", "German", List.of("deu", "ger")),
                languageItem("ru", "Russian", List.of("rus"))));
        return lookup;
    }

    private static SearchResult languageItem(String code, String title, List<String> aliases) {
        Map<String, Object> extra = new java.util.LinkedHashMap<>();
        extra.put("code", code);
        extra.put("title", title);
        if (!aliases.isEmpty()) {
            extra.put("aliases", aliases);
        }
        return new SearchResult(
                "iso639-" + code,
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

    @Test
    void parseExtractsLanguageFilterAndLeavesFreeText() {
        SearchFieldFilters.ParsedQuery parsed = SearchFieldFilters.parse("Tears languages:ru steel");
        assertThat(parsed.textQuery()).isEqualTo("Tears steel");
        assertThat(parsed.filters()).containsExactly(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru"));
    }

    @Test
    void parseLanguageFilterOnly() {
        SearchFieldFilters.ParsedQuery parsed = SearchFieldFilters.parse("languages:ru");
        assertThat(parsed.textQuery()).isEmpty();
        assertThat(parsed.filters()).hasSize(1);
    }

    @Test
    void parseCountLanguagesFilterCaseInsensitive() {
        SearchFieldFilters.ParsedQuery parsed = SearchFieldFilters.parse("COUNT(languages):9");
        assertThat(parsed.textQuery()).isEmpty();
        assertThat(parsed.filters()).containsExactly(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.COUNT_LANGUAGES_FIELD, "9"));
    }

    @Test
    void parseTitleFilter() {
        SearchFieldFilters.ParsedQuery parsed = SearchFieldFilters.parse("title:Tears languages:ru");
        assertThat(parsed.textQuery()).isEmpty();
        assertThat(parsed.filters()).containsExactly(
                new SearchFieldFilters.FieldFilter("title", "Tears"),
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru"));
    }

    @Test
    void matchesTitleContains() {
        SearchResult r = videoResult(List.of("ru"), 1);
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter("title", "tears")))).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter("title", "Steel")))).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter("title", "Synthetic")))).isFalse();
    }

    @Test
    void matchesTroveIdExactly() {
        SearchResult r = videoResult(List.of("ru"), 1);
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter("troveId", "test-movies")))).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter("troveId", "synology-movies")))).isFalse();
    }

    @Test
    void parseRejectsUnknownField() {
        assertThatThrownBy(() -> SearchFieldFilters.parse("director:Altman tears"))
                .isInstanceOf(InvalidSearchQueryException.class)
                .hasMessage("Unknown search field(s): director");
    }

    @Test
    void parseRejectsMultipleUnknownFields() {
        assertThatThrownBy(() -> SearchFieldFilters.parse("foo:1 director:Altman"))
                .isInstanceOf(InvalidSearchQueryException.class)
                .hasMessage("Unknown search field(s): director, foo");
    }

    @Test
    void parseLeavesColonInUrlLikeText() {
        SearchFieldFilters.ParsedQuery parsed = SearchFieldFilters.parse("see https://example.com/path");
        assertThat(parsed.textQuery()).isEqualTo("see https://example.com/path");
        assertThat(parsed.filters()).isEmpty();
    }

    @Test
    void matchesLanguageInArray() {
        SearchResult r = videoResult(List.of("de", "en", "ru"), 3);
        LanguageCodeLookup lookup = lookupWithGermanAndRussian();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "RU")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ja")), lookup)).isFalse();
    }

    @Test
    void matchesLanguageByDisplayNameOrCode() {
        LanguageCodeLookup lookup = lookupWithGermanAndRussian();
        SearchResult germanCodes = videoResult(List.of("deu"), 1);
        germanCodes = withLanguageDisplay(germanCodes, List.of("German"));

        assertThat(SearchFieldFilters.matches(germanCodes, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "German")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(germanCodes, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "deu")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(germanCodes, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "de")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(germanCodes, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "Russian")), lookup)).isFalse();
    }

    @Test
    void matchesLanguageWithoutLookupStillMatchesRawCodeSubstring() {
        SearchResult r = videoResult(List.of("de", "en", "ru"), 3);
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru")))).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "rus")))).isFalse();
    }

    @Test
    void matchesLanguageByDisplayNamePrefixOrSubstring() {
        LanguageCodeLookup lookup = lookupWithArabicAndMozarabic();
        SearchResult russian = videoResult(List.of("rus"), 1);
        russian = withLanguageDisplay(russian, List.of("Russian"));
        SearchResult arabic = videoResult(List.of("ara"), 1);
        arabic = withLanguageDisplay(arabic, List.of("Arabic"));
        SearchResult mozarabic = videoResult(List.of("mxi"), 1);
        mozarabic = withLanguageDisplay(mozarabic, List.of("Mozarabic"));

        assertThat(SearchFieldFilters.matches(russian, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "russ")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(arabic, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "arab")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(mozarabic, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "arab")), lookup)).isTrue();
        assertThat(SearchFieldFilters.matches(russian, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "arab")), lookup)).isFalse();
    }

    private static LanguageCodeLookup lookupWithArabicAndMozarabic() {
        LanguageCodeLookup lookup = new LanguageCodeLookup();
        lookup.rebuild(List.of(
                languageItem("ru", "Russian", List.of("rus")),
                languageItem("ar", "Arabic", List.of("ara")),
                languageItem("mxi", "Mozarabic", List.of())));
        return lookup;
    }

    @Test
    void matchesLanguageWithoutLookupStillMatchesRawCode() {
        SearchResult r = videoResult(List.of("de", "en", "ru"), 3);
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru")))).isTrue();
    }

    @Test
    void matchesCountLanguages() {
        SearchResult r = videoResult(List.of("de", "en", "ru"), 3);
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.COUNT_LANGUAGES_FIELD, "3")))).isTrue();
        assertThat(SearchFieldFilters.matches(r, List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.COUNT_LANGUAGES_FIELD, "9")))).isFalse();
    }

    @Test
    void matchesCombinedFilters() {
        SearchResult tears = videoResult(List.of("de", "en", "ru"), 3);
        SearchResult other = videoResult(List.of("ru"), 1);
        List<SearchFieldFilters.FieldFilter> both = List.of(
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.LANGUAGES_FIELD, "ru"),
                new SearchFieldFilters.FieldFilter(SearchFieldFilters.COUNT_LANGUAGES_FIELD, "3"));
        assertThat(SearchFieldFilters.matches(tears, both)).isTrue();
        assertThat(SearchFieldFilters.matches(other, both)).isFalse();
    }

    private static SearchResult withLanguageDisplay(SearchResult result, List<String> display) {
        Map<String, Object> extra = new java.util.LinkedHashMap<>(result.extraFields());
        extra.put(LanguageCodeLookup.DISPLAY_FIELD, display);
        return new SearchResult(
                result.id(),
                result.itemType(),
                result.title(),
                result.snippet(),
                result.trove(),
                result.troveId(),
                result.hasThumbnail(),
                result.thumbnailUrl(),
                result.largeImageUrl(),
                result.rawSourceItem(),
                result.files(),
                result.itemUrl(),
                extra);
    }

    private static SearchResult videoResult(List<String> languages, int count) {
        return new SearchResult(
                "test-movies-0",
                "video",
                "Tears of Steel",
                "de, en, ru",
                "Test Movies",
                "test-movies",
                false,
                null,
                null,
                null,
                List.of(),
                null,
                Map.of(
                        "languages", languages,
                        SearchFieldFilters.COUNT_LANGUAGES_FIELD, count,
                        "external_count", 10));
    }
}

package com.example.morsor.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LanguageCodeEnrichmentTest {

    @TempDir
    Path tempDir;

    private SearchDataService service;
    private LanguageCodeLookup lookup;

    @BeforeEach
    void setUp() {
        lookup = new LanguageCodeLookup();
        ReflectionTestUtils.setField(lookup, "languageTroveId", "iso639-languages");
        service = new SearchDataService(
                new PathMatchingResourcePatternResolver(),
                new ObjectMapper(),
                new MockEnvironment(),
                lookup);
        ReflectionTestUtils.setField(service, "dataLocation", "file:" + tempDir.toAbsolutePath() + "/*.json");
        ReflectionTestUtils.setField(service, "onlyTroveIds", "");
        ReflectionTestUtils.setField(service, "excludeTroveIds", "");
        ReflectionTestUtils.setField(service, "referenceTroveIds", "iso639-languages");
    }

    @Test
    void enrichesVideoLanguagesWithDisplayNames() throws Exception {
        Files.writeString(tempDir.resolve("iso639-languages.json"), """
                {
                  "id": "iso639-languages",
                  "shortName": "Languages",
                  "items": [
                    { "languageCode": { "code": "de", "title": "German", "aliases": ["deu"] } },
                    { "languageCode": { "code": "en", "title": "English", "aliases": ["eng"] } }
                  ]
                }
                """);
        Files.writeString(tempDir.resolve("movies.json"), """
                {
                  "id": "movies",
                  "shortName": "Movies",
                  "items": [
                    {
                      "video": {
                        "title": "Tears of Steel",
                        "subtitles": ["de", "en", "xyz"]
                      }
                    }
                  ]
                }
                """);

        service.reloadData();

        List<SearchResult> movies = service.search(null, "Tears").stream()
                .map(ScoredSearchResult::result)
                .filter(r -> "movies".equals(r.troveId()))
                .toList();
        assertThat(movies).hasSize(1);
        Map<String, Object> extra = movies.get(0).extraFields();
        assertThat(extra).containsEntry("subtitles", List.of("de", "en", "xyz"));
        assertThat(extra).containsEntry("subtitles(display)", List.of("German", "English", "xyz"));
    }

    @Test
    void enrichesThreeLetterSubtitleCodes() throws Exception {
        Files.writeString(tempDir.resolve("iso639-languages.json"), """
                {
                  "id": "iso639-languages",
                  "shortName": "Languages",
                  "items": [
                    { "languageCode": { "code": "eng", "title": "English" } },
                    { "languageCode": { "code": "deu", "title": "German" } },
                    { "languageCode": { "code": "spa", "title": "Spanish" } }
                  ]
                }
                """);
        Files.writeString(tempDir.resolve("movies.json"), """
                {
                  "id": "movies",
                  "shortName": "Movies",
                  "items": [
                    {
                      "video": {
                        "title": "Example Film",
                        "subtitles": ["eng", "deu", "spa", "xyz"]
                      }
                    }
                  ]
                }
                """);

        service.reloadData();

        List<SearchResult> movies = service.search(null, "Example").stream()
                .map(ScoredSearchResult::result)
                .filter(r -> "movies".equals(r.troveId()))
                .toList();
        assertThat(movies).hasSize(1);
        assertThat(movies.get(0).extraFields())
                .containsEntry("subtitles(display)", List.of("English", "German", "Spanish", "xyz"));
    }

    @Test
    void loadsLanguageTroveEvenWhenExcluded() throws Exception {
        Files.writeString(tempDir.resolve("iso639-languages.json"), """
                {
                  "id": "iso639-languages",
                  "shortName": "Languages",
                  "items": [
                    { "languageCode": { "code": "de", "title": "German" } }
                  ]
                }
                """);
        Files.writeString(tempDir.resolve("movies.json"), """
                {
                  "id": "movies",
                  "shortName": "Movies",
                  "items": [
                    { "video": { "title": "Example", "subtitles": ["de"] } }
                  ]
                }
                """);
        ReflectionTestUtils.setField(service, "excludeTroveIds", "iso639-languages");

        service.reloadData();

        assertThat(lookup.resolve("de")).isEqualTo("German");
        assertThat(service.getTroveOptions().stream().map(TroveOption::id)).doesNotContain("iso639-languages");
    }
}

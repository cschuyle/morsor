package com.example.morsor;

import com.example.morsor.search.CollectionToSearchResultMapper;
import com.example.morsor.search.SearchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;

import java.io.InputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CollectionToSearchResultMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void mapsCollectionJsonToSearchResults() throws Exception {
        try (InputStream in = new FileSystemResource("fixtures/data/little-prince.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
            assertThat(results).hasSize(1561);
            assertThat(results.get(0).trove()).isEqualTo("Little Prince");
            assertThat(results.get(0).troveId()).isEqualTo("little-prince");
            assertThat(results.get(0).title()).isEqualTo("Princi i Vogël - The Little Prince in Albanian");
            assertThat(results.get(0).id()).isEqualTo("little-prince-0");
            assertThat(results.get(1).id()).isEqualTo("PP-4277");
            assertThat(results.get(1).title()).isEqualTo("The Little Prince, in Ancient Greek");
        }
    }

    @Test
    void mapsTitlesFormatToSearchResults() throws Exception {
        String json = """
            {
              "titles": [
                "An Introduction to Machine Learning with Web Data",
                "Effective Data Visualization",
                "Introduction to Big Data"
              ],
              "id": "synology-bu-courses",
              "name": "Synology-BU: Courses",
              "shortName": "BU Courses (Video)"
            }
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(3);
        assertThat(results.get(0).trove()).isEqualTo("BU Courses (Video)");
        assertThat(results.get(0).troveId()).isEqualTo("synology-bu-courses");
        assertThat(results.get(0).title()).isEqualTo("An Introduction to Machine Learning with Web Data");
        assertThat(results.get(0).id()).isEqualTo("synology-bu-courses-0");
        assertThat(results.get(0).snippet()).isEqualTo("An Introduction to Machine Learning with Web Data");
        assertThat(results.get(1).title()).isEqualTo("Effective Data Visualization");
        assertThat(results.get(1).id()).isEqualTo("synology-bu-courses-1");
        assertThat(results.get(2).title()).isEqualTo("Introduction to Big Data");
        assertThat(results.get(2).id()).isEqualTo("synology-bu-courses-2");
    }

    @Test
    void mapsScreeningListFormatToSearchResults() throws Exception {
        try (InputStream in = new FileSystemResource("fixtures/data/screening-list.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
            assertThat(results).hasSize(8);
            assertThat(results.get(0).troveId()).isEqualTo("screening-list");
            assertThat(results.get(0).trove()).isEqualTo("Screenings");
            assertThat(results.get(0).title()).isEqualTo("Chicago");
            assertThat(results.get(0).snippet()).isEqualTo("Rob Marshall · 2002");
            assertThat(results.get(0).id()).isEqualTo("screening-list-0");
            assertThat(results.get(1).title()).isEqualTo("The Player");
            assertThat(results.get(1).snippet()).isEqualTo("Robert Altman · 1992");
        }
    }

    @Test
    void mapsLittlePrinceItemUrlToSearchResult() throws Exception {
        String json = """
            {
              "id": "test-trove",
              "name": "Test Trove",
              "shortName": "Test",
              "items": [
                {
                  "littlePrinceItem": {
                    "title": "Item with URL",
                    "smallImageUrl": "https://example.com/small.jpg",
                    "largeImageUrl": "https://example.com/large.jpg",
                    "itemUrl": "https://example.com/item-page"
                  }
                },
                {
                  "littlePrinceItem": {
                    "title": "Item with the kitchen sink thrown in",
                    "smallImageUrl": "https://example.com/s2.jpg",
                    "display-title": "The Little Prince, in Ancient Greek",
                    "format": "paperback",
                    "language": "Ancient Greek",
                    "original-title": "Le petit prince",
                    "author": "Antoine de Saint-Exupéry",
                    "translation-title": "Τὸ βασιλείδιον",
                    "translation-title-transliterated": "To Basileidion",
                    "translator": "Juan Coderch",
                    "year": "2017",
                    "publication-location": "St. Andrews",
                    "isbn13": "978-0-9571387-4-2",
                    "publisher": "Juan Coderch",
                    "tags": [
                      "language isolate*",
                      "dead language"
                    ],
                    "date-added": "2019-07-04",
                    "lpid": "PP-4277"
                  }
                },
                {
                  "movie": {
                    "title": "A Movie",
                    "year": "2020",
                    "itemUrl": "https://example.com/movie"
                  }
                }
              ]
            }
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(3);
        assertThat(results.get(0).itemType()).isEqualTo("littlePrinceItem");
        assertThat(results.get(0).itemUrl()).isEqualTo("https://example.com/item-page");
        assertThat(results.get(1).itemType()).isEqualTo("littlePrinceItem");
        assertThat(results.get(1).itemUrl()).isNull();
        assertThat(results.get(2).itemType()).isEqualTo("movie");
        assertThat(results.get(2).itemUrl()).isNull();

        // rawSourceItem: JSON items get pretty-printed multi-line JSON
        assertThat(results.get(0).rawSourceItem()).contains("littlePrinceItem");
        assertThat(results.get(0).rawSourceItem()).contains("\n");
        assertThat(results.get(0).rawSourceItem()).contains("Item with URL");

        SearchResult kitchenSink = results.get(1);

// fields mapped directly onto SearchResult
        assertThat(kitchenSink.trove()).isEqualTo("Test");
        assertThat(kitchenSink.troveId()).isEqualTo("test-trove");
        assertThat(kitchenSink.id()).isEqualTo("PP-4277");
        assertThat(kitchenSink.title()).isEqualTo("The Little Prince, in Ancient Greek");
        assertThat(kitchenSink.snippet()).isEqualTo("Ancient Greek · Antoine de Saint-Exupéry · 2017");
        assertThat(kitchenSink.hasThumbnail()).isTrue();
        assertThat(kitchenSink.thumbnailUrl()).isEqualTo("https://example.com/s2.jpg");
        assertThat(kitchenSink.largeImageUrl()).isNull();
        assertThat(kitchenSink.files()).isEmpty();
        assertThat(kitchenSink.itemType()).isEqualTo("littlePrinceItem");
        assertThat(kitchenSink.itemUrl()).isNull();

// fields not modeled in SearchResult are preserved in rawSourceItem
        JsonNode kitchenSinkRaw = objectMapper.readTree(kitchenSink.rawSourceItem()).get("littlePrinceItem");
        assertThat(kitchenSinkRaw).isNotNull();

        assertThat(kitchenSinkRaw.get("title").asText()).isEqualTo("Item with the kitchen sink thrown in");
        assertThat(kitchenSinkRaw.get("smallImageUrl").asText()).isEqualTo("https://example.com/s2.jpg");
        assertThat(kitchenSinkRaw.get("display-title").asText()).isEqualTo("The Little Prince, in Ancient Greek");
        assertThat(kitchenSinkRaw.get("format").asText()).isEqualTo("paperback");
        assertThat(kitchenSinkRaw.get("language").asText()).isEqualTo("Ancient Greek");
        assertThat(kitchenSinkRaw.get("original-title").asText()).isEqualTo("Le petit prince");
        assertThat(kitchenSinkRaw.get("author").asText()).isEqualTo("Antoine de Saint-Exupéry");
        assertThat(kitchenSinkRaw.get("translation-title").asText()).isEqualTo("Τὸ βασιλείδιον");
        assertThat(kitchenSinkRaw.get("translation-title-transliterated").asText()).isEqualTo("To Basileidion");
        assertThat(kitchenSinkRaw.get("translator").asText()).isEqualTo("Juan Coderch");
        assertThat(kitchenSinkRaw.get("year").asText()).isEqualTo("2017");
        assertThat(kitchenSinkRaw.get("publication-location").asText()).isEqualTo("St. Andrews");
        assertThat(kitchenSinkRaw.get("isbn13").asText()).isEqualTo("978-0-9571387-4-2");
        assertThat(kitchenSinkRaw.get("publisher").asText()).isEqualTo("Juan Coderch");
        assertThat(kitchenSinkRaw.get("date-added").asText()).isEqualTo("2019-07-04");
        assertThat(kitchenSinkRaw.get("lpid").asText()).isEqualTo("PP-4277");

        assertThat(kitchenSinkRaw.get("tags").isArray()).isTrue();
        assertThat(kitchenSinkRaw.get("tags").get(0).asText()).isEqualTo("language isolate*");
        assertThat(kitchenSinkRaw.get("tags").get(1).asText()).isEqualTo("dead language");
    }

    @Test
    void rawSourceItemForTitlesIsTheTitleString() throws Exception {
        String json = """
            {"id": "t", "titles": ["Title A", "Title B"]}
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(2);
        assertThat(results.get(0).rawSourceItem()).isEqualTo("Title A");
        assertThat(results.get(1).rawSourceItem()).isEqualTo("Title B");
    }
}

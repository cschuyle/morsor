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
                    "title": "Item without itemUrl",
                    "smallImageUrl": "https://example.com/s2.jpg"
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
    }
}

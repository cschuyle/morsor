package com.example.morsor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.InputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CollectionToSearchResultMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void mapsCollectionJsonToSearchResults() throws Exception {
        try (InputStream in = new ClassPathResource("data/little-prince.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
            assertThat(results).hasSize(2);
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
}

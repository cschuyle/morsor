package com.example.morsor.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class SearchDataServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void reloadContinuesWhenOneTroveFailsAndLoadsRemainingTroves() throws Exception {
        Files.writeString(tempDir.resolve("alpha.json"), """
                {
                  "id": "alpha",
                  "shortName": "Alpha",
                  "titles": ["Alpha title"]
                }
                """);
        Files.writeString(tempDir.resolve("broken.json"), """
                { this-is-not-valid-json
                """);
        Files.writeString(tempDir.resolve("beta.json"), """
                {
                  "id": "beta",
                  "shortName": "Beta",
                  "titles": ["Beta title"]
                }
                """);

        SearchDataService service = new SearchDataService(
                new PathMatchingResourcePatternResolver(),
                new ObjectMapper(),
                new MockEnvironment()
        );
        ReflectionTestUtils.setField(service, "dataLocation", "file:" + tempDir.toAbsolutePath() + "/*.json");
        ReflectionTestUtils.setField(service, "onlyTroveIds", "");
        ReflectionTestUtils.setField(service, "excludeTroveIds", "");

        service.reloadData();

        Set<String> loadedIds = service.getTroveOptions().stream()
                .map(TroveOption::id)
                .collect(Collectors.toSet());

        assertThat(loadedIds).containsExactlyInAnyOrder("alpha", "beta");
        assertThat(loadedIds).doesNotContain("broken");
        assertThat(service.search(null, "*")).isNotEmpty();
    }
}

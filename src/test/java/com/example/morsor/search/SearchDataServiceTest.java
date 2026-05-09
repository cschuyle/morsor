package com.example.morsor.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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

    /**
     * Duplicate detection must be symmetric: "Jacob's Ladder (1990)" in the primary trove
     * should match "Jacob's Ladder" in the compare trove, even though the compare item
     * lacks the year token. Previously the year token was a MUST clause that hard-excluded
     * the compare item.
     */
    @Test
    void duplicatesFoundWhenPrimaryHasYearSuffixAndCompareDoesNot() throws Exception {
        Files.writeString(tempDir.resolve("imdb.json"), """
                {
                  "id": "imdb",
                  "shortName": "IMDB",
                  "titles": ["Jacob's Ladder (1990)"]
                }
                """);
        Files.writeString(tempDir.resolve("movies.json"), """
                {
                  "id": "movies",
                  "shortName": "Movies",
                  "titles": ["Jacob's Ladder"]
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

        // Primary = imdb (has year), compare = movies (no year) — this direction previously failed.
        List<DuplicateMatchRow> imdbPrimary = service.searchDuplicates("imdb", Set.of("movies"), "", 5);
        assertThat(imdbPrimary)
                .as("primary=imdb(year), compare=movies(no year) should find a duplicate")
                .isNotEmpty();
        assertThat(imdbPrimary.get(0).primary().title()).isEqualTo("Jacob's Ladder (1990)");
        assertThat(imdbPrimary.get(0).matches().get(0).result().title()).isEqualTo("Jacob's Ladder");

        // Reverse direction should also work.
        List<DuplicateMatchRow> moviesPrimary = service.searchDuplicates("movies", Set.of("imdb"), "", 5);
        assertThat(moviesPrimary)
                .as("primary=movies(no year), compare=imdb(year) should find a duplicate")
                .isNotEmpty();
        assertThat(moviesPrimary.get(0).primary().title()).isEqualTo("Jacob's Ladder");
        assertThat(moviesPrimary.get(0).matches().get(0).result().title()).isEqualTo("Jacob's Ladder (1990)");
    }

    @Test
    void duplicateRerankPlacesExactMatchesBeforeYearSuffixOnlyMatches() throws Exception {
        SearchDataService service = new SearchDataService(
                new PathMatchingResourcePatternResolver(),
                new ObjectMapper(),
                new MockEnvironment()
        );

        SearchResult exactPrimary = new SearchResult(
                "1", null, "Alpha (2001)", "Alpha (2001)", "Trove", "trove", false,
                null, null, null, List.of(), null, null
        );
        SearchResult exactMatch = new SearchResult(
                "2", null, "alpha (2001)", "alpha (2001)", "Compare", "compare", false,
                null, null, null, List.of(), null, null
        );
        SearchResult yearPrimary = new SearchResult(
                "3", null, "Beta", "Beta", "Trove", "trove", false,
                null, null, null, List.of(), null, null
        );
        SearchResult yearMatch = new SearchResult(
                "4", null, "Beta (2001)", "Beta (2001)", "Compare", "compare", false,
                null, null, null, List.of(), null, null
        );
        SearchResult otherPrimary = new SearchResult(
                "5", null, "Gamma", "Gamma", "Trove", "trove", false,
                null, null, null, List.of(), null, null
        );
        SearchResult otherMatch = new SearchResult(
                "6", null, "Different", "Different", "Compare", "compare", false,
                null, null, null, List.of(), null, null
        );

        List<DuplicateMatchRow> rows = List.of(
                new DuplicateMatchRow(exactPrimary, List.of(new ScoredSearchResult(exactMatch, 1.0))),
                new DuplicateMatchRow(yearPrimary, List.of(new ScoredSearchResult(yearMatch, 1.0))),
                new DuplicateMatchRow(otherPrimary, List.of(new ScoredSearchResult(otherMatch, 1.0)))
        );

        Method rerank = SearchDataService.class.getDeclaredMethod("rerankDuplicateRows", List.class);
        rerank.setAccessible(true);
        @SuppressWarnings("unchecked")
        List<DuplicateMatchRow> reranked = (List<DuplicateMatchRow>) rerank.invoke(null, rows);

        assertThat(reranked).extracting(r -> r.primary().title())
                .containsExactly("Alpha (2001)", "Beta", "Gamma");
        assertThat(reranked).extracting(DuplicateMatchRow::rerank)
                .containsExactly(3, 2, 1);
    }
}

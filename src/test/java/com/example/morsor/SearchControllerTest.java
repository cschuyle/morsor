package com.example.morsor;

import com.example.morsor.search.DuplicateMatchRow;
import com.example.morsor.search.DuplicatesResponse;
import com.example.morsor.search.SearchResponse;
import com.example.morsor.search.SearchResult;
import com.example.morsor.search.SearchResultWithScore;
import com.example.morsor.search.ScoredSearchResult;
import com.example.morsor.search.TroveOption;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class SearchControllerTest {

    @LocalServerPort
    int port;

    final RestTemplate restTemplate = new RestTemplate();

    @Test
    void trovesReturnsListOfTroveOptions() {
        ResponseEntity<List<TroveOption>> response = restTemplate.exchange(
                "http://localhost:" + port + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {}
        );
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody()).as("Backend should return trove options from loaded data").isNotEmpty();
        assertThat(response.getBody().stream().map(TroveOption::id).toList()).contains("favorites");
        assertThat(response.getBody().stream().map(TroveOption::name).toList()).contains("IMDB Favs");
    }

    @Test
    void searchReturnsDataFromJson() {
        // With no filters we get all loaded results (verifies data is loaded from JSON)
        ResponseEntity<SearchResponse> allResponse = restTemplate.exchange(
                "http://localhost:" + port + "/api/search",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<SearchResponse>() {}
        );
        assertThat(allResponse.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(allResponse.getBody()).isNotNull();
        assertThat(allResponse.getBody().results()).as("Data should be loaded from JSON").isNotEmpty();

        // Filter by trove and query: should find Alien (1979)
        String url = "http://localhost:" + port + "/api/search?trove=favorites&query=Alien";
        ResponseEntity<SearchResponse> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<SearchResponse>() {}
        );
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        SearchResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.results()).as("Filtered search should return Alien (1979)").isNotEmpty();
        SearchResultWithScore alienRow = body.results().stream()
                .filter(r -> r.result() != null && "Alien (1979)".equals(r.result().title()))
                .findFirst()
                .orElse(null);
        assertThat(alienRow).isNotNull();
        SearchResult alienResult = alienRow.result();
        assertThat(alienResult.trove()).isEqualTo("IMDB Favs");
        assertThat(alienResult.title()).isEqualTo("Alien (1979)");
    }

    @Test
    void duplicatesExcludeSelfMatchWhenSameTroveInPrimaryAndCompare() {
        String url = "http://localhost:" + port + "/api/search/duplicates?primaryTrove=favorites&compareTrove=favorites&query=*";
        ResponseEntity<DuplicatesResponse> response = restTemplate.getForEntity(url, DuplicatesResponse.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        DuplicatesResponse body = response.getBody();
        assertThat(body).isNotNull();

        for (DuplicateMatchRow row : body.rows()) {
            String primaryId = row.primary() != null ? row.primary().id() : null;
            if (primaryId == null) {
                continue;
            }
            for (ScoredSearchResult match : row.matches() != null ? row.matches() : List.<ScoredSearchResult>of()) {
                String matchId = match.result() != null ? match.result().id() : null;
                assertThat(matchId)
                        .as("No match must be the same item as the primary (primary id=%s)", primaryId)
                        .isNotEqualTo(primaryId);
            }
        }
    }

    @Test
    void duplicatesOneRowPerGroupWhenSameTroveInPrimaryAndCompare() {
        String url = "http://localhost:" + port + "/api/search/duplicates?primaryTrove=favorites&compareTrove=favorites&query=*";
        ResponseEntity<DuplicatesResponse> response = restTemplate.getForEntity(url, DuplicatesResponse.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        DuplicatesResponse body = response.getBody();
        assertThat(body).isNotNull();

        List<String> groupKeys = body.rows().stream()
                .map(row -> {
                    TreeSet<String> group = new TreeSet<>();
                    if (row.primary() != null && row.primary().id() != null) {
                        group.add(row.primary().id());
                    }
                    for (ScoredSearchResult m : row.matches() != null ? row.matches() : List.<ScoredSearchResult>of()) {
                        if (m.result() != null && m.result().id() != null) {
                            group.add(m.result().id());
                        }
                    }
                    return String.join(",", group);
                })
                .toList();
        assertThat(groupKeys)
                .as("Each duplicate group must appear only once (no symmetric duplicate rows)")
                .doesNotHaveDuplicates();
    }

    @Test
    void authSessionReturns200WithAuthenticatedFalseForAnonymousRequest() {
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                "http://localhost:" + port + "/api/auth/session",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<Map<String, Object>>() {});
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody()).containsEntry("authenticated", false);
    }

    @Test
    void csrfPrimeReturns204WithoutAuthentication() {
        ResponseEntity<Void> response = restTemplate.exchange(
                "http://localhost:" + port + "/api/auth/csrf-prime",
                HttpMethod.GET,
                null,
                Void.class);
        assertThat(response.getStatusCode().value()).isEqualTo(204);
    }
}

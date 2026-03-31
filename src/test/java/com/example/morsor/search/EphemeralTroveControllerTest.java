package com.example.morsor.search;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class EphemeralTroveControllerTest {

    @LocalServerPort
    int port;

    private final RestTemplate restTemplate = new RestTemplate();

    @Test
    void registerEphemeralTroveSearchAndDelete() {
        String base = "http://localhost:" + port;
        String registerUrl = base + "/api/ephemeral-troves";
        String body = """
                {
                  "displayName": "/tmp/ephem-test-dir",
                  "items": [
                    { "id": "a", "title": "Alpha File" },
                    { "id": "b", "title": "Beta Dir" }
                  ]
                }
                """;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<EphemeralTroveRegistration> post = restTemplate.exchange(
                registerUrl,
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                EphemeralTroveRegistration.class);

        assertThat(post.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(post.getBody()).isNotNull();
        assertThat(post.getBody().troveId()).startsWith("local-");
        assertThat(post.getBody().displayName()).isEqualTo("/tmp/ephem-test-dir");
        assertThat(post.getBody().count()).isEqualTo(2);

        String troveId = post.getBody().troveId();

        ResponseEntity<List<TroveOption>> troves = restTemplate.exchange(
                base + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {}
        );
        assertThat(troves.getBody()).isNotNull();
        assertThat(troves.getBody().stream().map(TroveOption::id).toList()).contains(troveId);

        String searchUrl = base + "/api/search?query=*&trove=" + troveId;
        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                searchUrl,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).hasSize(2);

        ResponseEntity<Void> del = restTemplate.exchange(
                base + "/api/ephemeral-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(del.getStatusCode().is2xxSuccessful()).isTrue();

        ResponseEntity<List<TroveOption>> trovesAfter = restTemplate.exchange(
                base + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {}
        );
        assertThat(trovesAfter.getBody()).isNotNull();
        assertThat(trovesAfter.getBody().stream().map(TroveOption::id).toList()).doesNotContain(troveId);
    }

    @Test
    void reloadTrovesKeepsEphemeralTroveRegistered() {
        String base = "http://localhost:" + port;
        String body = """
                { "displayName": "/virtual/keep-after-reload", "items": [ { "id": "x", "title": "Stay" } ] }
                """;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<EphemeralTroveRegistration> post = restTemplate.exchange(
                base + "/api/ephemeral-troves",
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                EphemeralTroveRegistration.class);
        assertThat(post.getBody()).isNotNull();
        String troveId = post.getBody().troveId();

        restTemplate.postForEntity(base + "/api/troves/reload", null, Void.class);

        ResponseEntity<List<TroveOption>> troves = restTemplate.exchange(
                base + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {}
        );
        assertThat(troves.getBody()).isNotNull();
        assertThat(troves.getBody().stream().map(TroveOption::id).toList()).contains(troveId);

        restTemplate.exchange(
                base + "/api/ephemeral-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void deleteUnknownEphemeralTroveReturns404() {
        String url = "http://localhost:" + port + "/api/ephemeral-troves/local-00000000-0000-0000-0000-000000000000";
        assertThatThrownBy(() -> restTemplate.exchange(url, HttpMethod.DELETE, null, Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }
}

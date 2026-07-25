package com.example.morsor.search;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class DynamicTroveControllerTest {

    @LocalServerPort
    int port;

    private final RestTemplate restTemplate = new RestTemplate();

    private String base() {
        return "http://localhost:" + port;
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    @Test
    void createEmptyDynamicTroveAddItemSearchDelete() {
        String uniqueName = "Dyn Test " + UUID.randomUUID();
        String expectedSlug = SearchDataService.normalizeDynamicTroveName(uniqueName);
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody()).isNotNull();
        assertThat(created.getBody().troveId()).isEqualTo(expectedSlug);
        assertThat(created.getBody().name()).isEqualTo(expectedSlug);
        assertThat(created.getBody().count()).isEqualTo(0);

        String troveId = created.getBody().troveId();

        ResponseEntity<List<TroveOption>> troves = restTemplate.exchange(
                base() + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {});
        assertThat(troves.getBody()).isNotNull();
        TroveOption option = troves.getBody().stream()
                .filter(t -> troveId.equals(t.id()))
                .findFirst()
                .orElseThrow();
        assertThat(option.dynamic()).isTrue();
        assertThat(option.count()).isEqualTo(0);
        assertThat(option.name()).isEqualTo(expectedSlug);

        ResponseEntity<DynamicTroveItemRegistration> item = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Alpha Widget\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);
        assertThat(item.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(item.getBody()).isNotNull();
        assertThat(item.getBody().title()).isEqualTo("Alpha Widget");
        assertThat(item.getBody().id()).isEqualTo("Alpha Widget");

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).hasSize(1);
        assertThat(search.getBody().results().get(0).result().title()).isEqualTo("Alpha Widget");
        assertThat(search.getBody().results().get(0).result().id()).isEqualTo("Alpha Widget");

        URI deleteUri = UriComponentsBuilder
                .fromUriString(base() + "/api/dynamic-troves/" + troveId + "/items")
                .queryParam("title", "Alpha Widget")
                .build()
                .encode()
                .toUri();
        ResponseEntity<Void> delItem = restTemplate.exchange(
                deleteUri,
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(delItem.getStatusCode().is2xxSuccessful()).isTrue();

        ResponseEntity<SearchResponse> searchAfter = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(searchAfter.getBody()).isNotNull();
        assertThat(searchAfter.getBody().results()).isEmpty();

        ResponseEntity<Void> delTrove = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(delTrove.getStatusCode().is2xxSuccessful()).isTrue();

        ResponseEntity<List<TroveOption>> trovesAfter = restTemplate.exchange(
                base() + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {});
        assertThat(trovesAfter.getBody()).isNotNull();
        assertThat(trovesAfter.getBody().stream().map(TroveOption::id).toList()).doesNotContain(troveId);
    }

    @Test
    void createDynamicTroveRejectsDuplicateNameCaseInsensitive() {
        String uniqueName = "DupName-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName.toUpperCase() + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class))
                .isInstanceOf(HttpClientErrorException.Conflict.class);

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void reloadKeepsDynamicTrove() {
        String uniqueName = "ReloadDyn-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>(
                        "{\"name\":\"" + uniqueName + "\"}",
                        jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Stay\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);

        restTemplate.postForEntity(base() + "/api/troves/reload", null, Void.class);

        ResponseEntity<List<TroveOption>> troves = restTemplate.exchange(
                base() + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {});
        assertThat(troves.getBody()).isNotNull();
        assertThat(troves.getBody().stream().map(TroveOption::id).toList()).contains(troveId);

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=Stay&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).hasSize(1);

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void deleteUnknownDynamicTroveReturns404() {
        String url = base() + "/api/dynamic-troves/no-such-dynamic-trove";
        assertThatThrownBy(() -> restTemplate.exchange(url, HttpMethod.DELETE, null, Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void createDynamicTroveRejectsNameMatchingExistingFixtureTrove() {
        // "Vinyl" is the display name for the vinyl fixture trove.
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"Vinyl\"}", jsonHeaders()),
                DynamicTroveRegistration.class))
                .isInstanceOf(HttpClientErrorException.Conflict.class);
    }

    @Test
    void bulkLoadAddsTitlesAndSkipsDuplicatesInOneRequest() {
        String uniqueName = "BulkLoad-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Already Here\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);

        String body = """
                {"titles":["New One","Already Here","  new   one  ","Brand New","Brand New"]}
                """;
        ResponseEntity<DynamicTroveItemBulkLoadResult> bulk = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items/bulk",
                HttpMethod.POST,
                new HttpEntity<>(body, jsonHeaders()),
                DynamicTroveItemBulkLoadResult.class);
        assertThat(bulk.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bulk.getBody()).isNotNull();
        assertThat(bulk.getBody().troveId()).isEqualTo(troveId);
        assertThat(bulk.getBody().loaded()).isEqualTo(2);
        assertThat(bulk.getBody().added()).containsExactly("New One", "Brand New");
        assertThat(bulk.getBody().duplicates())
                .containsExactly("Already Here", "new   one", "Brand New");

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).extracting(r -> r.result().title())
                .containsExactlyInAnyOrder("Already Here", "New One", "Brand New");

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void bulkLoadUnknownTroveReturns404() {
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves/no-such-dynamic-trove/items/bulk",
                HttpMethod.POST,
                new HttpEntity<>("{\"titles\":[\"x\"]}", jsonHeaders()),
                DynamicTroveItemBulkLoadResult.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void addItemRejectsDuplicateNormalizedTitleWithinTrove() {
        String uniqueName = "NormDup-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        ResponseEntity<DynamicTroveItemRegistration> first = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Hello   World\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"  hello world  \"}", jsonHeaders()),
                DynamicTroveItemRegistration.class))
                .isInstanceOf(HttpClientErrorException.Conflict.class);

        // Same normalized title is allowed in a different dynamic trove.
        String otherName = "NormDupOther-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> other = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + otherName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(other.getBody()).isNotNull();
        ResponseEntity<DynamicTroveItemRegistration> otherItem = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + other.getBody().troveId() + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Hello World\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);
        assertThat(otherItem.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + other.getBody().troveId(),
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void normalizeDynamicTroveItemTitleCollapsesWhitespaceAndCase() {
        assertThat(SearchDataService.normalizeDynamicTroveItemTitle("  Foo \t  BAR \n baz  "))
                .isEqualTo("foo bar baz");
        assertThat(SearchDataService.normalizeDynamicTroveItemTitle("Hello World"))
                .isEqualTo(SearchDataService.normalizeDynamicTroveItemTitle("hello   world"));
    }

    @Test
    void normalizeDynamicTroveNameSlugifies() {
        assertThat(SearchDataService.normalizeDynamicTroveName("  Hello, World!! "))
                .isEqualTo("hello-world");
        assertThat(SearchDataService.normalizeDynamicTroveName("My   Cool_List"))
                .isEqualTo("my-coollist");
        assertThat(SearchDataService.normalizeDynamicTroveName("Vinyl"))
                .isEqualTo("vinyl");
    }

    @Test
    void createDynamicTroveStoresNormalizedNameAsId() {
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"Hello, World " + UUID.randomUUID() + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String slug = created.getBody().troveId();
        assertThat(slug).startsWith("hello-world-");
        assertThat(created.getBody().name()).isEqualTo(slug);
        assertThat(slug).matches("hello-world-[0-9a-f]+");

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + slug,
                HttpMethod.DELETE,
                null,
                Void.class);
    }
}

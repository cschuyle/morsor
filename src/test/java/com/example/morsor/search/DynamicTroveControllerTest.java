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

    // Default SimpleClientHttpRequestFactory (java.net.HttpURLConnection) rejects PATCH; the
    // JDK HttpClient-backed factory supports it natively.
    private final RestTemplate restTemplate =
            new RestTemplate(new org.springframework.http.client.JdkClientHttpRequestFactory());

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
        assertThat(created.getBody().name()).isEqualTo(uniqueName);
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
        assertThat(option.name()).isEqualTo(uniqueName);

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
        assertThat(search.getBody().results().get(0).result().trove()).isEqualTo(uniqueName);
        assertThat(search.getBody().results().get(0).result().troveId()).isEqualTo(expectedSlug);

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
    void bulkDeleteRemovesTitlesAndReportsNotFoundInOneRequest() {
        String uniqueName = "BulkDelete-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items/bulk",
                HttpMethod.POST,
                new HttpEntity<>(
                        "{\"titles\":[\"Keep Me\",\"Remove Me\",\"Also Remove\"]}",
                        jsonHeaders()),
                DynamicTroveItemBulkLoadResult.class);

        String body = """
                {"titles":["Remove Me","  also   remove  ","Never Here"]}
                """;
        ResponseEntity<DynamicTroveItemBulkDeleteResult> bulk = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items/bulk-delete",
                HttpMethod.POST,
                new HttpEntity<>(body, jsonHeaders()),
                DynamicTroveItemBulkDeleteResult.class);
        assertThat(bulk.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(bulk.getBody()).isNotNull();
        assertThat(bulk.getBody().troveId()).isEqualTo(troveId);
        assertThat(bulk.getBody().removed()).isEqualTo(2);
        assertThat(bulk.getBody().removedTitles()).containsExactlyInAnyOrder("Remove Me", "Also Remove");
        assertThat(bulk.getBody().notFound()).containsExactly("Never Here");

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).extracting(r -> r.result().title())
                .containsExactly("Keep Me");

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void bulkDeleteUnknownTroveReturns404() {
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves/no-such-dynamic-trove/items/bulk-delete",
                HttpMethod.POST,
                new HttpEntity<>("{\"titles\":[\"x\"]}", jsonHeaders()),
                DynamicTroveItemBulkDeleteResult.class))
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
    void createDynamicTroveStoresSlugAsIdAndKeepsDisplayName() {
        String displayName = "Hello, World " + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + displayName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String slug = created.getBody().troveId();
        assertThat(slug).startsWith("hello-world-");
        assertThat(slug).matches("hello-world-[0-9a-f]+");
        assertThat(created.getBody().name()).isEqualTo(displayName);

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + slug,
                HttpMethod.DELETE,
                null,
                Void.class);
    }

    @Test
    void convertEphemeralTroveToDynamicKeepsIdAndContents() {
        String registerBody = """
                {
                  "displayName": "/tmp/convert-ephem-test",
                  "items": [
                    { "id": "a", "title": "Ephem Alpha" },
                    { "id": "b", "title": "Ephem Beta" }
                  ]
                }
                """;
        ResponseEntity<EphemeralTroveRegistration> registered = restTemplate.exchange(
                base() + "/api/ephemeral-troves",
                HttpMethod.POST,
                new HttpEntity<>(registerBody, jsonHeaders()),
                EphemeralTroveRegistration.class);
        assertThat(registered.getBody()).isNotNull();
        String troveId = registered.getBody().troveId();

        ResponseEntity<DynamicTroveRegistration> converted = restTemplate.exchange(
                base() + "/api/dynamic-troves/convert",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceTroveId\":\"" + troveId + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(converted.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(converted.getBody()).isNotNull();
        assertThat(converted.getBody().troveId()).isEqualTo(troveId);
        assertThat(converted.getBody().name()).isEqualTo("/tmp/convert-ephem-test");
        assertThat(converted.getBody().count()).isEqualTo(2);

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
        assertThat(option.count()).isEqualTo(2);

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).extracting(r -> r.result().title())
                .containsExactlyInAnyOrder("Ephem Alpha", "Ephem Beta");

        restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
    }

    @Test
    void convertS3BackedTroveToDynamicRecordsLoadErrorOnReload() {
        String troveId = "dvds";
        ResponseEntity<SearchResponse> before = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(before.getBody()).isNotNull();
        List<String> originalTitles = before.getBody().results().stream()
                .map(r -> r.result().title())
                .toList();
        assertThat(originalTitles).isNotEmpty();

        try {
            ResponseEntity<DynamicTroveRegistration> converted = restTemplate.exchange(
                    base() + "/api/dynamic-troves/convert",
                    HttpMethod.POST,
                    new HttpEntity<>("{\"sourceTroveId\":\"" + troveId + "\"}", jsonHeaders()),
                    DynamicTroveRegistration.class);
            assertThat(converted.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            assertThat(converted.getBody()).isNotNull();
            assertThat(converted.getBody().troveId()).isEqualTo(troveId);
            assertThat(converted.getBody().count()).isEqualTo(originalTitles.size());

            ResponseEntity<List<TroveOption>> trovesAfterConvert = restTemplate.exchange(
                    base() + "/api/troves",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<List<TroveOption>>() {});
            assertThat(trovesAfterConvert.getBody()).isNotNull();
            TroveOption option = trovesAfterConvert.getBody().stream()
                    .filter(t -> troveId.equals(t.id()))
                    .findFirst()
                    .orElseThrow();
            assertThat(option.dynamic()).isTrue();

            // Full reload should skip the now-superseded S3/classpath copy and record why.
            restTemplate.postForEntity(base() + "/api/troves/reload", null, Void.class);

            ResponseEntity<List<String>> loadErrors = restTemplate.exchange(
                    base() + "/api/troves/load-errors",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<List<String>>() {});
            assertThat(loadErrors.getBody()).isNotNull();
            assertThat(loadErrors.getBody())
                    .contains("Didn't load S3 trove '" + troveId + "' superseded by dynamic trove");

            ResponseEntity<List<TroveOption>> trovesAfterReload = restTemplate.exchange(
                    base() + "/api/troves",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<List<TroveOption>>() {});
            assertThat(trovesAfterReload.getBody()).isNotNull();
            TroveOption optionAfterReload = trovesAfterReload.getBody().stream()
                    .filter(t -> troveId.equals(t.id()))
                    .findFirst()
                    .orElseThrow();
            assertThat(optionAfterReload.dynamic()).isTrue();
            assertThat(optionAfterReload.count()).isEqualTo(originalTitles.size());

            restTemplate.postForEntity(base() + "/api/troves/load-errors/clear", null, Void.class);
            ResponseEntity<List<String>> clearedErrors = restTemplate.exchange(
                    base() + "/api/troves/load-errors",
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<List<String>>() {});
            assertThat(clearedErrors.getBody()).isEmpty();
        } finally {
            // Restore the fixture: delete the dynamic trove, then reload so the classpath
            // copy of "dvds" loads again (no dynamic trove is left to shadow it).
            restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
            restTemplate.postForEntity(base() + "/api/troves/reload", null, Void.class);
        }

        ResponseEntity<List<TroveOption>> trovesAfterRestore = restTemplate.exchange(
                base() + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {});
        assertThat(trovesAfterRestore.getBody()).isNotNull();
        TroveOption restored = trovesAfterRestore.getBody().stream()
                .filter(t -> troveId.equals(t.id()))
                .findFirst()
                .orElseThrow();
        assertThat(restored.dynamic()).isFalse();
        assertThat(restored.count()).isEqualTo(originalTitles.size());
    }

    @Test
    void convertAlreadyDynamicTroveReturns409() {
        String uniqueName = "ConvertAlreadyDyn-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves/convert",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceTroveId\":\"" + troveId + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class))
                .isInstanceOf(HttpClientErrorException.Conflict.class);

        restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
    }

    @Test
    void convertUnknownTroveReturns400() {
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/dynamic-troves/convert",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceTroveId\":\"no-such-trove-at-all\"}", jsonHeaders()),
                DynamicTroveRegistration.class))
                .isInstanceOf(HttpClientErrorException.BadRequest.class);
    }

    @Test
    void renameDynamicTroveUpdatesDisplayNameKeepsId() {
        String uniqueName = "RenameMe-" + UUID.randomUUID();
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
                new HttpEntity<>("{\"title\":\"Renamed Item\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);

        String newName = "Renamed-" + UUID.randomUUID();
        ResponseEntity<Void> renamed = restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.PATCH,
                new HttpEntity<>("{\"name\":\"" + newName + "\"}", jsonHeaders()),
                Void.class);
        assertThat(renamed.getStatusCode().is2xxSuccessful()).isTrue();

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
        assertThat(option.name()).isEqualTo(newName);
        assertThat(option.id()).isEqualTo(troveId);

        ResponseEntity<SearchResponse> search = restTemplate.exchange(
                base() + "/api/search?query=*&trove=" + troveId,
                HttpMethod.GET,
                null,
                SearchResponse.class);
        assertThat(search.getBody()).isNotNull();
        assertThat(search.getBody().results()).hasSize(1);
        assertThat(search.getBody().results().get(0).result().trove()).isEqualTo(newName);
        assertThat(search.getBody().results().get(0).result().troveId()).isEqualTo(troveId);

        restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
    }

    @Test
    void renameUnknownDynamicTroveReturns404() {
        String url = base() + "/api/dynamic-troves/no-such-dynamic-trove";
        assertThatThrownBy(() -> restTemplate.exchange(
                url,
                HttpMethod.PATCH,
                new HttpEntity<>("{\"name\":\"Anything\"}", jsonHeaders()),
                Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    private String troveUpdateTimestamp(String troveId) {
        ResponseEntity<List<TroveOption>> troves = restTemplate.exchange(
                base() + "/api/troves",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveOption>>() {});
        assertThat(troves.getBody()).isNotNull();
        return troves.getBody().stream()
                .filter(t -> troveId.equals(t.id()))
                .findFirst()
                .orElseThrow()
                .updateTimestamp();
    }

    /**
     * Item add/delete (and bulk variants) must bump the trove's updateTimestamp, since the web UI
     * polls /api/troves and diffs it to invalidate its own client-side cache when a change happens
     * out-of-band (e.g. via the CLI) rather than through that browser tab's own action handlers.
     */
    @Test
    void itemMutationsBumpUpdateTimestamp() {
        String uniqueName = "Touch-" + UUID.randomUUID();
        ResponseEntity<DynamicTroveRegistration> created = restTemplate.exchange(
                base() + "/api/dynamic-troves",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + uniqueName + "\"}", jsonHeaders()),
                DynamicTroveRegistration.class);
        assertThat(created.getBody()).isNotNull();
        String troveId = created.getBody().troveId();

        String afterCreate = troveUpdateTimestamp(troveId);
        assertThat(afterCreate).isNotNull();

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items",
                HttpMethod.POST,
                new HttpEntity<>("{\"title\":\"Touch Item\"}", jsonHeaders()),
                DynamicTroveItemRegistration.class);
        String afterAdd = troveUpdateTimestamp(troveId);
        assertThat(afterAdd).isNotEqualTo(afterCreate);

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items/bulk",
                HttpMethod.POST,
                new HttpEntity<>("{\"titles\":[\"Bulk Touch\"]}", jsonHeaders()),
                DynamicTroveItemBulkLoadResult.class);
        String afterBulkAdd = troveUpdateTimestamp(troveId);
        assertThat(afterBulkAdd).isNotEqualTo(afterAdd);

        URI deleteUri = UriComponentsBuilder
                .fromUriString(base() + "/api/dynamic-troves/" + troveId + "/items")
                .queryParam("title", "Touch Item")
                .build()
                .encode()
                .toUri();
        restTemplate.exchange(deleteUri, HttpMethod.DELETE, null, Void.class);
        String afterDelete = troveUpdateTimestamp(troveId);
        assertThat(afterDelete).isNotEqualTo(afterBulkAdd);

        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId + "/items/bulk-delete",
                HttpMethod.POST,
                new HttpEntity<>("{\"titles\":[\"Bulk Touch\"]}", jsonHeaders()),
                DynamicTroveItemBulkDeleteResult.class);
        String afterBulkDelete = troveUpdateTimestamp(troveId);
        assertThat(afterBulkDelete).isNotEqualTo(afterDelete);

        String newName = "Touched-" + UUID.randomUUID();
        restTemplate.exchange(
                base() + "/api/dynamic-troves/" + troveId,
                HttpMethod.PATCH,
                new HttpEntity<>("{\"name\":\"" + newName + "\"}", jsonHeaders()),
                Void.class);
        String afterRename = troveUpdateTimestamp(troveId);
        assertThat(afterRename).isNotEqualTo(afterBulkDelete);

        restTemplate.exchange(base() + "/api/dynamic-troves/" + troveId, HttpMethod.DELETE, null, Void.class);
    }
}

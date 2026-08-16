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
class TroveGroupControllerTest {

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

    private ResponseEntity<TroveGroupResponse> createGroup(String name) {
        return restTemplate.exchange(
                base() + "/api/trove-groups",
                HttpMethod.POST,
                new HttpEntity<>("{\"name\":\"" + name + "\"}", jsonHeaders()),
                TroveGroupResponse.class);
    }

    private void deleteGroup(String groupId) {
        restTemplate.exchange(base() + "/api/trove-groups/" + groupId, HttpMethod.DELETE, null, Void.class);
    }

    @Test
    void createGroupAddMembersListDeleteGroup() {
        String uniqueName = "Group Test " + UUID.randomUUID();
        String expectedSlug = SearchDataService.normalizeDynamicTroveName(uniqueName);

        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody()).isNotNull();
        assertThat(created.getBody().id()).isEqualTo(expectedSlug);
        assertThat(created.getBody().name()).isEqualTo(uniqueName);
        assertThat(created.getBody().troveIds()).isEmpty();

        String groupId = created.getBody().id();

        ResponseEntity<Void> addA = restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId + "/members",
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"vinyl\"}", jsonHeaders()),
                Void.class);
        assertThat(addA.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<Void> addB = restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId + "/members",
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"dvds\"}", jsonHeaders()),
                Void.class);
        assertThat(addB.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<List<TroveGroupResponse>> list = restTemplate.exchange(
                base() + "/api/trove-groups",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveGroupResponse>>() {});
        assertThat(list.getBody()).isNotNull();
        TroveGroupResponse group = list.getBody().stream()
                .filter(g -> groupId.equals(g.id()))
                .findFirst()
                .orElseThrow();
        assertThat(group.troveIds()).containsExactlyInAnyOrder("vinyl", "dvds");

        URI removeUri = UriComponentsBuilder
                .fromUriString(base() + "/api/trove-groups/" + groupId + "/members")
                .queryParam("troveId", "vinyl")
                .build()
                .encode()
                .toUri();
        ResponseEntity<Void> removed = restTemplate.exchange(removeUri, HttpMethod.DELETE, null, Void.class);
        assertThat(removed.getStatusCode().is2xxSuccessful()).isTrue();

        ResponseEntity<List<TroveGroupResponse>> listAfterRemove = restTemplate.exchange(
                base() + "/api/trove-groups",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveGroupResponse>>() {});
        assertThat(listAfterRemove.getBody()).isNotNull();
        TroveGroupResponse groupAfterRemove = listAfterRemove.getBody().stream()
                .filter(g -> groupId.equals(g.id()))
                .findFirst()
                .orElseThrow();
        assertThat(groupAfterRemove.troveIds()).containsExactly("dvds");

        deleteGroup(groupId);

        ResponseEntity<List<TroveGroupResponse>> listAfterDelete = restTemplate.exchange(
                base() + "/api/trove-groups",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveGroupResponse>>() {});
        assertThat(listAfterDelete.getBody()).isNotNull();
        assertThat(listAfterDelete.getBody().stream().map(TroveGroupResponse::id).toList())
                .doesNotContain(groupId);
    }

    @Test
    void createGroupRejectsDuplicateNameCaseInsensitive() {
        String uniqueName = "DupGroup-" + UUID.randomUUID();
        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getBody()).isNotNull();
        String groupId = created.getBody().id();

        assertThatThrownBy(() -> createGroup(uniqueName.toUpperCase()))
                .isInstanceOf(HttpClientErrorException.Conflict.class);

        deleteGroup(groupId);
    }

    @Test
    void renameGroupUpdatesDisplayNameKeepsId() {
        String uniqueName = "RenameGroup-" + UUID.randomUUID();
        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getBody()).isNotNull();
        String groupId = created.getBody().id();

        String newName = "Renamed-" + UUID.randomUUID();
        ResponseEntity<Void> renamed = restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId,
                HttpMethod.PATCH,
                new HttpEntity<>("{\"name\":\"" + newName + "\"}", jsonHeaders()),
                Void.class);
        assertThat(renamed.getStatusCode().is2xxSuccessful()).isTrue();

        ResponseEntity<List<TroveGroupResponse>> list = restTemplate.exchange(
                base() + "/api/trove-groups",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveGroupResponse>>() {});
        assertThat(list.getBody()).isNotNull();
        TroveGroupResponse group = list.getBody().stream()
                .filter(g -> groupId.equals(g.id()))
                .findFirst()
                .orElseThrow();
        assertThat(group.name()).isEqualTo(newName);
        assertThat(group.id()).isEqualTo(groupId);

        deleteGroup(groupId);
    }

    @Test
    void renameUnknownGroupReturns404() {
        String url = base() + "/api/trove-groups/no-such-trove-group";
        assertThatThrownBy(() -> restTemplate.exchange(
                url,
                HttpMethod.PATCH,
                new HttpEntity<>("{\"name\":\"Anything\"}", jsonHeaders()),
                Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void deleteUnknownGroupReturns404() {
        String url = base() + "/api/trove-groups/no-such-trove-group";
        assertThatThrownBy(() -> restTemplate.exchange(url, HttpMethod.DELETE, null, Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void addMemberToUnknownGroupReturns404() {
        String url = base() + "/api/trove-groups/no-such-trove-group/members";
        assertThatThrownBy(() -> restTemplate.exchange(
                url,
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"vinyl\"}", jsonHeaders()),
                Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void addDuplicateMemberReturns409() {
        String uniqueName = "DupMember-" + UUID.randomUUID();
        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getBody()).isNotNull();
        String groupId = created.getBody().id();

        restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId + "/members",
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"vinyl\"}", jsonHeaders()),
                Void.class);

        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId + "/members",
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"vinyl\"}", jsonHeaders()),
                Void.class))
                .isInstanceOf(HttpClientErrorException.Conflict.class);

        deleteGroup(groupId);
    }

    @Test
    void removeUnknownMemberReturns404() {
        String uniqueName = "RemoveUnknownMember-" + UUID.randomUUID();
        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getBody()).isNotNull();
        String groupId = created.getBody().id();

        URI removeUri = UriComponentsBuilder
                .fromUriString(base() + "/api/trove-groups/" + groupId + "/members")
                .queryParam("troveId", "never-added")
                .build()
                .encode()
                .toUri();
        assertThatThrownBy(() -> restTemplate.exchange(removeUri, HttpMethod.DELETE, null, Void.class))
                .isInstanceOf(HttpClientErrorException.NotFound.class);

        deleteGroup(groupId);
    }

    @Test
    void deletingGroupCascadesToMembers() {
        String uniqueName = "CascadeDelete-" + UUID.randomUUID();
        ResponseEntity<TroveGroupResponse> created = createGroup(uniqueName);
        assertThat(created.getBody()).isNotNull();
        String groupId = created.getBody().id();

        restTemplate.exchange(
                base() + "/api/trove-groups/" + groupId + "/members",
                HttpMethod.POST,
                new HttpEntity<>("{\"troveId\":\"vinyl\"}", jsonHeaders()),
                Void.class);

        deleteGroup(groupId);

        // Re-creating a group with the same slug should come back with no members, proving the
        // FK cascade actually removed the old membership row rather than orphaning it.
        ResponseEntity<TroveGroupResponse> recreated = createGroup(uniqueName);
        assertThat(recreated.getBody()).isNotNull();
        assertThat(recreated.getBody().troveIds()).isEmpty();

        deleteGroup(recreated.getBody().id());
    }
}

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

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class TroveDirLinkControllerTest {

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
    void setListAndDeleteDirLink() {
        String troveId = "vinyl-" + UUID.randomUUID();

        ResponseEntity<TroveDirLinkRow> set = restTemplate.exchange(
                base() + "/api/trove-dir-links/" + troveId,
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"My Vinyl\"}", jsonHeaders()),
                TroveDirLinkRow.class);
        assertThat(set.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(set.getBody()).isNotNull();
        assertThat(set.getBody().troveId()).isEqualTo(troveId);
        assertThat(set.getBody().folderLabel()).isEqualTo("My Vinyl");

        ResponseEntity<List<TroveDirLinkRow>> list = restTemplate.exchange(
                base() + "/api/trove-dir-links",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveDirLinkRow>>() {});
        assertThat(list.getBody()).isNotNull();
        assertThat(list.getBody().stream().map(TroveDirLinkRow::troveId)).contains(troveId);

        // Re-connecting (e.g. a different folder, or the same one) overwrites — last wins.
        ResponseEntity<TroveDirLinkRow> reSet = restTemplate.exchange(
                base() + "/api/trove-dir-links/" + troveId,
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"Vinyl (external drive)\"}", jsonHeaders()),
                TroveDirLinkRow.class);
        assertThat(reSet.getBody()).isNotNull();
        assertThat(reSet.getBody().folderLabel()).isEqualTo("Vinyl (external drive)");

        ResponseEntity<Void> deleted = restTemplate.exchange(
                base() + "/api/trove-dir-links/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<List<TroveDirLinkRow>> listAfterDelete = restTemplate.exchange(
                base() + "/api/trove-dir-links",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveDirLinkRow>>() {});
        assertThat(listAfterDelete.getBody()).isNotNull();
        assertThat(listAfterDelete.getBody().stream().map(TroveDirLinkRow::troveId)).doesNotContain(troveId);
    }

    @Test
    void deletingUnknownDirLinkIsIdempotentNoContent() {
        // Disconnecting a trove that was never (or no longer) registered must not error — the
        // caller's local IndexedDB state is always the source of truth for whether it's connected.
        ResponseEntity<Void> deleted = restTemplate.exchange(
                base() + "/api/trove-dir-links/no-such-trove-root",
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void setWithBlankFolderLabelReturns400() {
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/trove-dir-links/vinyl",
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"   \"}", jsonHeaders()),
                TroveDirLinkRow.class))
                .isInstanceOf(HttpClientErrorException.BadRequest.class);
    }
}

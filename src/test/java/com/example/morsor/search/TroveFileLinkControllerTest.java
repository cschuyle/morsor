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
class TroveFileLinkControllerTest {

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
    void setListAndDeleteFileLink() {
        String troveId = "vinyl-" + UUID.randomUUID();

        ResponseEntity<TroveFileLinkRow> set = restTemplate.exchange(
                base() + "/api/trove-file-links/" + troveId,
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"My Vinyl\"}", jsonHeaders()),
                TroveFileLinkRow.class);
        assertThat(set.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(set.getBody()).isNotNull();
        assertThat(set.getBody().troveId()).isEqualTo(troveId);
        assertThat(set.getBody().folderLabel()).isEqualTo("My Vinyl");

        ResponseEntity<List<TroveFileLinkRow>> list = restTemplate.exchange(
                base() + "/api/trove-file-links",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveFileLinkRow>>() {});
        assertThat(list.getBody()).isNotNull();
        assertThat(list.getBody().stream().map(TroveFileLinkRow::troveId)).contains(troveId);

        // Re-connecting (e.g. a different folder, or the same one) overwrites — last wins.
        ResponseEntity<TroveFileLinkRow> reSet = restTemplate.exchange(
                base() + "/api/trove-file-links/" + troveId,
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"Vinyl (external drive)\"}", jsonHeaders()),
                TroveFileLinkRow.class);
        assertThat(reSet.getBody()).isNotNull();
        assertThat(reSet.getBody().folderLabel()).isEqualTo("Vinyl (external drive)");

        ResponseEntity<Void> deleted = restTemplate.exchange(
                base() + "/api/trove-file-links/" + troveId,
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<List<TroveFileLinkRow>> listAfterDelete = restTemplate.exchange(
                base() + "/api/trove-file-links",
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<List<TroveFileLinkRow>>() {});
        assertThat(listAfterDelete.getBody()).isNotNull();
        assertThat(listAfterDelete.getBody().stream().map(TroveFileLinkRow::troveId)).doesNotContain(troveId);
    }

    @Test
    void deletingUnknownFileLinkIsIdempotentNoContent() {
        // Disconnecting a trove that was never (or no longer) registered must not error — the
        // caller's local IndexedDB state is always the source of truth for whether it's connected.
        ResponseEntity<Void> deleted = restTemplate.exchange(
                base() + "/api/trove-file-links/no-such-trove-root",
                HttpMethod.DELETE,
                null,
                Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void setWithBlankFolderLabelReturns400() {
        assertThatThrownBy(() -> restTemplate.exchange(
                base() + "/api/trove-file-links/vinyl",
                HttpMethod.PUT,
                new HttpEntity<>("{\"folderLabel\":\"   \"}", jsonHeaders()),
                TroveFileLinkRow.class))
                .isInstanceOf(HttpClientErrorException.BadRequest.class);
    }
}

package com.example.morsor;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SearchControllerTest {

    @LocalServerPort
    int port;

    final RestTemplate restTemplate = new RestTemplate();

    @Test
    void searchReturnsCannedData() {
        String url = "http://localhost:" + port + "/search?trove=newspaper&query=test";
        ResponseEntity<SearchResponse> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                null,
                new ParameterizedTypeReference<>() {}
        );
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        SearchResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(3);
        assertThat(body.results()).hasSize(3);
        assertThat(body.results().get(0).id()).isEqualTo("1");
        assertThat(body.results().get(0).trove()).isEqualTo("newspaper");
        assertThat(body.results().get(0).title()).isEqualTo("First result for test");
    }
}

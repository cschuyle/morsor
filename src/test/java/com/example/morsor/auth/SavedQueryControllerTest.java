package com.example.morsor.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SavedQueryControllerTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listReturns401WhenAnonymous() {
        SavedQueryController c = new SavedQueryController(mock(UserRepository.class), mock(SavedQueryRepository.class));
        ResponseEntity<?> res = c.list();
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void listReturnsRowsForUser() {
        User u = new User();
        u.setId(7L);
        u.setUsername("alice");
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("alice")).thenReturn(Optional.of(u));
        SavedQuery row = new SavedQuery();
        row.setId(1L);
        row.setUserId(7L);
        row.setLabel("L");
        row.setConsoleQuery("q=test");
        row.setMode("search");
        row.setSummary("S");
        row.setCreatedAt(Instant.parse("2025-01-01T12:00:00Z"));
        SavedQueryRepository repo = mock(SavedQueryRepository.class);
        when(repo.findByUserIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(row));

        login("alice");
        SavedQueryController c = new SavedQueryController(users, repo);
        @SuppressWarnings("unchecked")
        ResponseEntity<List<SavedQueryController.SavedQueryResponse>> res =
                (ResponseEntity<List<SavedQueryController.SavedQueryResponse>>) (ResponseEntity<?>) c.list();

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody().get(0).consoleQuery()).isEqualTo("q=test");
    }

    @Test
    void createTrimsLeadingQuestionMarkOnConsoleQuery() {
        User u = new User();
        u.setId(2L);
        u.setUsername("bob");
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("bob")).thenReturn(Optional.of(u));
        SavedQueryRepository repo = mock(SavedQueryRepository.class);
        when(repo.insert(eq(2L), anyString(), eq("mode=search&q=*"), eq("search"), anyString())).thenReturn(99L);

        login("bob");
        SavedQueryController c = new SavedQueryController(users, repo);
        var body = new SavedQueryController.CreateSavedQueryRequest("My label", "?mode=search&q=*", "search", "sum");
        ResponseEntity<?> res = c.create(body);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        verify(repo).insert(eq(2L), eq("My label"), eq("mode=search&q=*"), eq("search"), eq("sum"));
    }

    @Test
    void deleteReturns404WhenNotOwned() {
        User u = new User();
        u.setId(3L);
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("carol")).thenReturn(Optional.of(u));
        SavedQueryRepository repo = mock(SavedQueryRepository.class);
        when(repo.deleteByIdAndUserId(5L, 3L)).thenReturn(0);

        login("carol");
        SavedQueryController c = new SavedQueryController(users, repo);
        ResponseEntity<Void> res = c.delete(5L);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void createRejectsBadMode() {
        User u = new User();
        u.setId(1L);
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("d")).thenReturn(Optional.of(u));
        login("d");
        SavedQueryController c = new SavedQueryController(users, mock(SavedQueryRepository.class));
        var body = new SavedQueryController.CreateSavedQueryRequest("", "q=a", "bogus", null);
        ResponseEntity<?> res = c.create(body);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        @SuppressWarnings("unchecked")
        Map<String, String> err = (Map<String, String>) res.getBody();
        assertThat(err).containsKey("error");
    }

    private static void login(String username) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        username,
                        "n/a",
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }
}

package com.example.morsor.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link AuthController#authSession()} must touch JDBC so the SPA does not enter the app when the
 * auth database (e.g. Postgres) is unreachable.
 */
class AuthControllerAuthSessionTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authSessionReturns401WhenNotAuthenticated() {
        AuthController controller = new AuthController(
                mock(UserRepository.class),
                mock(ApiTokenRepository.class),
                mock(TokenHashService.class));

        ResponseEntity<Map<String, Boolean>> res = controller.authSession();

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void authSessionReturns200WhenUserLoadsFromRepository() {
        User user = new User();
        user.setUsername("alice");
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("alice")).thenReturn(Optional.of(user));

        AuthController controller = new AuthController(
                users,
                mock(ApiTokenRepository.class),
                mock(TokenHashService.class));

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "alice",
                        "n/a",
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))));

        ResponseEntity<Map<String, Boolean>> res = controller.authSession();

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("ok", true);
    }

    @Test
    void authSessionReturns403WhenUserNotInDatabase() {
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("bob")).thenReturn(Optional.empty());

        AuthController controller = new AuthController(
                users,
                mock(ApiTokenRepository.class),
                mock(TokenHashService.class));

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "bob",
                        "n/a",
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))));

        ResponseEntity<Map<String, Boolean>> res = controller.authSession();

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void authSessionReturns503WhenJdbcConnectionFails() {
        UserRepository users = mock(UserRepository.class);
        when(users.findByUsername("carol"))
                .thenThrow(new CannotGetJdbcConnectionException("Connection refused", new SQLException("refused")));

        AuthController controller = new AuthController(
                users,
                mock(ApiTokenRepository.class),
                mock(TokenHashService.class));

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "carol",
                        "n/a",
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))));

        ResponseEntity<Map<String, Boolean>> res = controller.authSession();

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }
}

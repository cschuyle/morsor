package com.example.morsor.auth;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class AuthController {

    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RNG = new SecureRandom();

    private final UserRepository userRepository;
    private final ApiTokenRepository apiTokenRepository;
    private final TokenHashService tokenHashService;

    public AuthController(UserRepository userRepository,
                          ApiTokenRepository apiTokenRepository,
                          TokenHashService tokenHashService) {
        this.userRepository = userRepository;
        this.apiTokenRepository = apiTokenRepository;
        this.tokenHashService = tokenHashService;
    }

    /**
     * Anonymous GET so the SPA can create a session and receive the {@code XSRF-TOKEN} cookie before
     * {@code POST /login}. This endpoint is always permitted and returns 204.
     */
    @GetMapping("/auth/csrf-prime")
    public ResponseEntity<Void> csrfPrime() {
        return ResponseEntity.noContent().build();
    }

    /**
     * Reports whether the current principal is logged in for the SPA (backed by JDBC).
     * Returns 200 {@code {"authenticated":false}} when there is no real login so DevTools does not show
     * 401 for normal “visit app while logged out” flows. 403 = stale session (principal not in DB).
     */
    @GetMapping("/auth/session")
    public ResponseEntity<Map<String, Object>> authSession() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null
                || !auth.isAuthenticated()
                || auth.getPrincipal() == null
                || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.ok(Map.of("authenticated", false));
        }
        String username = auth.getName();
        if (username == null || username.isBlank() || "anonymousUser".equalsIgnoreCase(username)) {
            return ResponseEntity.ok(Map.of("authenticated", false));
        }
        try {
            Optional<User> user = userRepository.findByUsername(username);
            if (user.isEmpty()) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            return ResponseEntity.ok(Map.of("authenticated", true));
        } catch (DataAccessException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @PostMapping("/tokens")
    public ResponseEntity<Map<String, String>> createToken(@RequestBody(required = false) Map<String, String> body) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal() == null) {
            return ResponseEntity.status(401).build();
        }
        String username = auth.getName();
        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) {
            return ResponseEntity.status(403).build();
        }
        String plainToken = generateToken();
        String hash = tokenHashService.hash(plainToken);
        String name = body != null && body.containsKey("name") ? body.get("name") : null;
        apiTokenRepository.save(user.getId(), hash, name);
        return ResponseEntity.ok(Map.of(
            "token", plainToken,
            "name", name != null ? name : ""
        ));
    }

    private static String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RNG.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

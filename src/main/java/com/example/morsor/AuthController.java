package com.example.morsor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 * Authenticated endpoints: issue API tokens (tied to the current principal).
 */
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
     * Create a new API token for the current user. Returns the plain token once; store it securely.
     * Request body may include optional "name" (e.g. "dev", "CI").
     */
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

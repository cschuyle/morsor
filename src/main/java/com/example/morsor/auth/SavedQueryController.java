package com.example.morsor.auth;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/saved-queries")
public class SavedQueryController {

    private static final int MAX_CONSOLE_QUERY_CHARS = 8192;
    private static final int MAX_LABEL_CHARS = 512;
    private static final int MAX_SUMMARY_CHARS = 512;
    private static final Set<String> MODES = Set.of("search", "duplicates", "uniques");

    private final UserRepository userRepository;
    private final SavedQueryRepository savedQueryRepository;

    public SavedQueryController(UserRepository userRepository, SavedQueryRepository savedQueryRepository) {
        this.userRepository = userRepository;
        this.savedQueryRepository = savedQueryRepository;
    }

    @GetMapping
    public ResponseEntity<?> list() {
        Optional<User> user = currentUser();
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            List<SavedQueryResponse> rows = savedQueryRepository.findByUserIdOrderByCreatedAtDesc(user.get().getId()).stream()
                    .map(SavedQueryController::toResponse)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(rows);
        } catch (DataAccessException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateSavedQueryRequest body) {
        Optional<User> user = currentUser();
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (body == null || body.consoleQuery() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "consoleQuery is required"));
        }
        String cq = normalizeConsoleQuery(body.consoleQuery());
        if (cq.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "consoleQuery is empty"));
        }
        if (cq.length() > MAX_CONSOLE_QUERY_CHARS) {
            return ResponseEntity.badRequest().body(Map.of("error", "consoleQuery is too long"));
        }
        String mode = normalizeMode(body.mode());
        if (mode == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "mode must be search, duplicates, or uniques"));
        }
        String label = truncate(body.label() != null ? body.label() : "", MAX_LABEL_CHARS);
        if (label.isBlank()) {
            label = truncate(body.summary() != null ? body.summary() : "Saved query", MAX_LABEL_CHARS);
        }
        String summary = body.summary() != null ? truncate(body.summary(), MAX_SUMMARY_CHARS) : null;
        try {
            long id = savedQueryRepository.insert(user.get().getId(), label, cq, mode, summary);
            SavedQuery created = new SavedQuery();
            created.setId(id);
            created.setUserId(user.get().getId());
            created.setLabel(label);
            created.setConsoleQuery(cq);
            created.setMode(mode);
            created.setSummary(summary);
            created.setCreatedAt(Instant.now());
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
        } catch (DataAccessException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        Optional<User> user = currentUser();
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            int n = savedQueryRepository.deleteByIdAndUserId(id, user.get().getId());
            if (n == 0) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.noContent().build();
        } catch (DataAccessException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    private Optional<User> currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null || auth.getName().isBlank()) {
            return Optional.empty();
        }
        return userRepository.findByUsername(auth.getName());
    }

    private static String normalizeConsoleQuery(String raw) {
        String s = raw.trim();
        if (s.startsWith("?")) {
            s = s.substring(1).trim();
        }
        return s;
    }

    private static String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return "search";
        }
        String m = mode.trim().toLowerCase(Locale.ROOT);
        return MODES.contains(m) ? m : null;
    }

    private static String truncate(String s, int max) {
        if (s.length() <= max) {
            return s;
        }
        return s.substring(0, max);
    }

    private static SavedQueryResponse toResponse(SavedQuery q) {
        return new SavedQueryResponse(
                q.getId(),
                q.getLabel() != null ? q.getLabel() : "",
                q.getConsoleQuery(),
                q.getMode() != null ? q.getMode() : "search",
                q.getSummary(),
                q.getCreatedAt() != null ? q.getCreatedAt() : Instant.EPOCH);
    }

    public record SavedQueryResponse(long id, String label, String consoleQuery, String mode, String summary, Instant createdAt) {
    }

    public record CreateSavedQueryRequest(String label, String consoleQuery, String mode, String summary) {
    }
}

package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Metadata for per-trove "local directories" (File System Access API folders): which troves
 * have a folder connected, and what it's labeled. Shared/advisory only — a browser must still
 * connect its own folder locally (IndexedDB) to actually read files; see TroveDirLinkRow.
 */
@RestController
@RequestMapping("/api/trove-dir-links")
public class TroveDirLinkController {

    private static final Logger log = LoggerFactory.getLogger(TroveDirLinkController.class);
    private static final int MAX_LABEL_LEN = 512;

    private final TroveDirLinkRepository repository;

    public TroveDirLinkController(TroveDirLinkRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<TroveDirLinkRow> list() {
        return repository.findAll();
    }

    public record TroveDirLinkSetRequest(String folderLabel) {}

    /** Connect (or change) the folder label for a trove. Body: {"folderLabel": "..."}. */
    @PutMapping("/{troveId}")
    public ResponseEntity<TroveDirLinkRow> set(
            @PathVariable String troveId,
            @RequestBody TroveDirLinkSetRequest body) {
        if (troveId == null || troveId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String raw = body == null || body.folderLabel() == null ? "" : body.folderLabel().trim();
        if (raw.isEmpty() || raw.length() > MAX_LABEL_LEN) {
            return ResponseEntity.badRequest().build();
        }
        log.info("PUT /api/trove-dir-links/{}: folderLabel.preview={}", troveId, previewForLog(raw));
        return ResponseEntity.ok(repository.upsert(troveId, raw));
    }

    @DeleteMapping("/{troveId}")
    public ResponseEntity<Void> remove(@PathVariable String troveId) {
        log.info("DELETE /api/trove-dir-links/{}", troveId);
        // Idempotent: disconnecting a trove this browser never registered (or already removed
        // elsewhere) is a no-op, not an error — the caller's local IndexedDB state always wins.
        repository.delete(troveId);
        return ResponseEntity.noContent().build();
    }

    private static String previewForLog(String s) {
        if (s == null) {
            return "(null)";
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return "(blank)";
        }
        int max = 160;
        if (t.length() <= max) {
            return t;
        }
        return t.substring(0, max) + "…(" + t.length() + " chars)";
    }
}

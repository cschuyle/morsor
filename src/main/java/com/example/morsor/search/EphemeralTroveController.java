package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * In-memory troves from CLI-uploaded directory manifests. Not persisted; cleared on process restart.
 * Visible to all authenticated API clients until removed or restart.
 */
@RestController
@RequestMapping("/api/ephemeral-troves")
public class EphemeralTroveController {

    private static final Logger log = LoggerFactory.getLogger(EphemeralTroveController.class);

    private final SearchDataService searchDataService;
    private final SearchCache searchCache;

    public EphemeralTroveController(SearchDataService searchDataService, SearchCache searchCache) {
        this.searchDataService = searchDataService;
        this.searchCache = searchCache;
    }

    @PostMapping
    public ResponseEntity<EphemeralTroveRegistration> register(@RequestBody EphemeralTroveRegisterRequest body) {
        if (body == null) {
            log.warn("POST /api/ephemeral-troves: rejected (empty body)");
            return ResponseEntity.badRequest().build();
        }
        List<EphemeralManifestItem> items = body.items() != null ? body.items() : List.of();
        String dn = body.displayName();
        log.info(
                "POST /api/ephemeral-troves: displayName.length={} itemCount={} displayName.preview={}",
                dn != null ? dn.length() : 0,
                items.size(),
                previewForLog(dn));
        try {
            EphemeralTroveRegistration reg = searchDataService.registerEphemeralTrove(dn, items);
            searchCache.clear();
            log.info(
                    "POST /api/ephemeral-troves: registered troveId={} count={} name.preview={}",
                    reg.troveId(),
                    reg.count(),
                    previewForLog(reg.displayName()));
            return ResponseEntity.status(HttpStatus.CREATED).body(reg);
        } catch (IllegalArgumentException e) {
            log.warn("POST /api/ephemeral-troves: bad request: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/{troveId}")
    public ResponseEntity<Void> remove(@PathVariable String troveId) {
        log.info("DELETE /api/ephemeral-troves/{}", troveId);
        boolean removed = searchDataService.removeEphemeralTrove(troveId);
        if (!removed) {
            log.info("DELETE /api/ephemeral-troves/{}: not found", troveId);
            return ResponseEntity.notFound().build();
        }
        searchCache.clear();
        log.info("DELETE /api/ephemeral-troves/{}: removed", troveId);
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

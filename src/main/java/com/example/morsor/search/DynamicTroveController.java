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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * DB-backed interactive troves (titles only). Shared by all authenticated clients.
 */
@RestController
@RequestMapping("/api/dynamic-troves")
public class DynamicTroveController {

    private static final Logger log = LoggerFactory.getLogger(DynamicTroveController.class);

    private final SearchDataService searchDataService;
    private final SearchCache searchCache;

    public DynamicTroveController(SearchDataService searchDataService, SearchCache searchCache) {
        this.searchDataService = searchDataService;
        this.searchCache = searchCache;
    }

    @PostMapping
    public ResponseEntity<DynamicTroveRegistration> create(@RequestBody DynamicTroveCreateRequest body) {
        if (body == null) {
            return ResponseEntity.badRequest().build();
        }
        log.info("POST /api/dynamic-troves: name.preview={}", previewForLog(body.name()));
        try {
            DynamicTroveRegistration reg = searchDataService.createDynamicTrove(body.name());
            searchCache.clear();
            return ResponseEntity.status(HttpStatus.CREATED).body(reg);
        } catch (IllegalArgumentException e) {
            log.warn("POST /api/dynamic-troves: bad request: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (IllegalStateException e) {
            log.warn("POST /api/dynamic-troves: conflict: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    @DeleteMapping("/{troveId}")
    public ResponseEntity<Void> remove(@PathVariable String troveId) {
        log.info("DELETE /api/dynamic-troves/{}", troveId);
        boolean removed = searchDataService.removeDynamicTrove(troveId);
        if (!removed) {
            return ResponseEntity.notFound().build();
        }
        searchCache.clear();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{troveId}/items")
    public ResponseEntity<DynamicTroveItemRegistration> addItem(
            @PathVariable String troveId,
            @RequestBody DynamicTroveItemCreateRequest body) {
        if (body == null) {
            return ResponseEntity.badRequest().build();
        }
        log.info("POST /api/dynamic-troves/{}/items: title.preview={}", troveId, previewForLog(body.title()));
        try {
            DynamicTroveItemRegistration reg = searchDataService.addDynamicTroveItem(troveId, body.title());
            searchCache.clear();
            return ResponseEntity.status(HttpStatus.CREATED).body(reg);
        } catch (IllegalArgumentException e) {
            log.warn("POST /api/dynamic-troves/{}/items: bad request: {}", troveId, e.getMessage());
            if (e.getMessage() != null && e.getMessage().startsWith("Unknown dynamic trove")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        } catch (IllegalStateException e) {
            log.warn("POST /api/dynamic-troves/{}/items: conflict: {}", troveId, e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    /**
     * Bulk-add titles in one request. Duplicates (normalized title already in the trove, or
     * earlier in this list) are skipped and listed in the response; they do not fail the request.
     */
    @PostMapping("/{troveId}/items/bulk")
    public ResponseEntity<DynamicTroveItemBulkLoadResult> addItemsBulk(
            @PathVariable String troveId,
            @RequestBody DynamicTroveItemBulkCreateRequest body) {
        if (body == null || body.titles() == null) {
            return ResponseEntity.badRequest().build();
        }
        log.info(
                "POST /api/dynamic-troves/{}/items/bulk: titles.size={}",
                troveId,
                body.titles().size());
        try {
            DynamicTroveItemBulkLoadResult result =
                    searchDataService.addDynamicTroveItemsBulk(troveId, body.titles());
            if (result.loaded() > 0) {
                searchCache.clear();
            }
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            log.warn("POST /api/dynamic-troves/{}/items/bulk: bad request: {}", troveId, e.getMessage());
            if (e.getMessage() != null && e.getMessage().startsWith("Unknown dynamic trove")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        } catch (IllegalStateException e) {
            log.warn("POST /api/dynamic-troves/{}/items/bulk: unavailable: {}", troveId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @DeleteMapping("/{troveId}/items")
    public ResponseEntity<Void> removeItem(
            @PathVariable String troveId,
            @RequestParam String title) {
        log.info("DELETE /api/dynamic-troves/{}/items: title.preview={}", troveId, previewForLog(title));
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        boolean removed = searchDataService.removeDynamicTroveItem(troveId, title);
        if (!removed) {
            return ResponseEntity.notFound().build();
        }
        searchCache.clear();
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

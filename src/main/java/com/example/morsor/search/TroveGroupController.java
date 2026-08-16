package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * DB-backed trove groups ("aliases" in morsr-cli parlance): named groups of trove ids, shared
 * by all authenticated clients. Management-only for now — not yet wired into query building.
 */
@RestController
@RequestMapping("/api/trove-groups")
public class TroveGroupController {

    private static final Logger log = LoggerFactory.getLogger(TroveGroupController.class);
    private static final int MAX_GROUP_NAME_LEN = 512;

    private final TroveGroupRepository repository;

    public TroveGroupController(TroveGroupRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<TroveGroupResponse> list() {
        List<TroveGroupRow> groups = repository.findAllGroups();
        List<TroveGroupMemberRow> members = repository.findAllMembers();
        Map<String, List<String>> troveIdsByGroup = members.stream()
                .collect(Collectors.groupingBy(
                        TroveGroupMemberRow::groupId,
                        Collectors.mapping(TroveGroupMemberRow::troveId, Collectors.toList())));
        return groups.stream()
                .map(g -> new TroveGroupResponse(g.id(), g.name(), troveIdsByGroup.getOrDefault(g.id(), List.of())))
                .toList();
    }

    public record TroveGroupCreateRequest(String name) {}

    @PostMapping
    public ResponseEntity<TroveGroupResponse> create(@RequestBody TroveGroupCreateRequest body) {
        if (body == null) {
            return ResponseEntity.badRequest().build();
        }
        String raw = body.name() == null ? "" : body.name().trim();
        if (raw.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        if (raw.length() > MAX_GROUP_NAME_LEN) {
            return ResponseEntity.badRequest().build();
        }
        String slug = SearchDataService.normalizeDynamicTroveName(raw);
        if (slug.isEmpty() || slug.length() > MAX_GROUP_NAME_LEN) {
            return ResponseEntity.badRequest().build();
        }
        log.info("POST /api/trove-groups: name.preview={}", previewForLog(raw));
        if (nameTakenCaseInsensitive(raw, null)) {
            log.warn("POST /api/trove-groups: conflict: name already exists");
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        try {
            repository.insertGroup(slug, raw);
        } catch (DataIntegrityViolationException e) {
            log.warn("POST /api/trove-groups: conflict: id already exists");
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(new TroveGroupResponse(slug, raw, List.of()));
    }

    /** Rename a group's display name (id unchanged). Body: {"name": "..."}. */
    @PatchMapping("/{groupId}")
    public ResponseEntity<Void> rename(
            @PathVariable String groupId,
            @RequestBody Map<String, String> body) {
        String newName = body == null ? null : body.get("name");
        if (newName == null || newName.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String raw = newName.trim();
        if (raw.length() > MAX_GROUP_NAME_LEN) {
            return ResponseEntity.badRequest().build();
        }
        log.info("PATCH /api/trove-groups/{}: name.preview={}", groupId, previewForLog(raw));
        Optional<TroveGroupRow> existing = repository.findGroupById(groupId);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (nameTakenCaseInsensitive(raw, groupId)) {
            log.warn("PATCH /api/trove-groups/{}: conflict: name already exists", groupId);
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        repository.updateGroupName(groupId, raw);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> remove(@PathVariable String groupId) {
        log.info("DELETE /api/trove-groups/{}", groupId);
        int removed = repository.deleteGroup(groupId);
        if (removed == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().build();
    }

    public record TroveGroupMemberAddRequest(String troveId) {}

    @PostMapping("/{groupId}/members")
    public ResponseEntity<Void> addMember(
            @PathVariable String groupId,
            @RequestBody TroveGroupMemberAddRequest body) {
        if (body == null || body.troveId() == null || body.troveId().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String troveId = body.troveId().trim();
        log.info("POST /api/trove-groups/{}/members: troveId={}", groupId, troveId);
        if (repository.findGroupById(groupId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            repository.insertMember(groupId, troveId);
        } catch (DataIntegrityViolationException e) {
            log.warn("POST /api/trove-groups/{}/members: conflict: already a member", groupId);
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        repository.touchGroup(groupId);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @DeleteMapping("/{groupId}/members")
    public ResponseEntity<Void> removeMember(
            @PathVariable String groupId,
            @RequestParam String troveId) {
        log.info("DELETE /api/trove-groups/{}/members: troveId={}", groupId, troveId);
        if (troveId == null || troveId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        int removed = repository.deleteMember(groupId, troveId);
        if (removed == 0) {
            return ResponseEntity.notFound().build();
        }
        repository.touchGroup(groupId);
        return ResponseEntity.noContent().build();
    }

    private boolean nameTakenCaseInsensitive(String name, String excludingGroupId) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        return repository.findAllGroups().stream()
                .filter(g -> excludingGroupId == null || !g.id().equals(excludingGroupId))
                .anyMatch(g -> g.name().toLowerCase(java.util.Locale.ROOT).equals(lower));
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

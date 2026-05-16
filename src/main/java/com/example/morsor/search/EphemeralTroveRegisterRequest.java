package com.example.morsor.search;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EphemeralTroveRegisterRequest(
        /** Trove label in the UI/API, e.g. the directory's full path from the CLI. */
        String displayName,
        List<EphemeralManifestItem> items,
        /** True when this request comes from the CLI local-trove flow. */
        Boolean cliCreated,
        /**
         * Optional: the ID of the non-ephemeral trove this ephemeral trove is a local
         * directory mirror of. Kept for backward compatibility; prefer {@code sisterTroveIds}.
         */
        String sisterTroveId,
        /** Optional: opaque hash of the directory contents at upload time, for change detection. */
        String contentHash,
        /**
         * Optional: if provided, the server uses this exact string as the ephemeral trove ID
         * instead of generating one. Used by the CLI to assign stable, deterministic IDs like
         * {@code local-sister_hostname:/path/to/dir∈trove-id}.
         */
        String explicitTroveId,
        /**
         * Optional: one or more companion non-ephemeral trove IDs this ephemeral mirrors.
         * Searches on any of these troves will automatically include this trove's results.
         * Takes precedence over {@code sisterTroveId} when non-empty.
         */
        List<String> sisterTroveIds) {}

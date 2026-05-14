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
         * directory mirror of. When set, searches on the non-ephemeral trove automatically
         * include this trove's results as well.
         */
        String sisterTroveId,
        /** Optional: opaque hash of the directory contents at upload time, for change detection. */
        String contentHash) {}

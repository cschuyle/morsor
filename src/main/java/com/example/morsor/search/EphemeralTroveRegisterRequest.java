package com.example.morsor.search;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EphemeralTroveRegisterRequest(
        /** Trove label in the UI/API, e.g. the directory's full path from the CLI. */
        String displayName,
        List<EphemeralManifestItem> items) {}

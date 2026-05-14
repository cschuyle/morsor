package com.example.morsor.search;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A non-ephemeral trove paired with its currently registered local sister ephemeral trove. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SisterRegistration(
        String troveId,
        String ephemeralTroveId,
        String contentHash,
        String registeredAt) {}

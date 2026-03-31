package com.example.morsor.search;

/** Result of registering an in-memory trove via the API. */
public record EphemeralTroveRegistration(String troveId, String displayName, int count) {}

package com.example.morsor.search;

import java.time.Instant;

/** Snapshot of the trove_staleness row (at most one row exists). */
public record TroveStaleness(long id, Instant detectedAt, String staleTroveIds) {}

package com.example.morsor.auth;

import java.time.Instant;

/**
 * A query console URL fragment (and metadata) persisted for the signed-in user.
 */
public class SavedQuery {

    private long id;
    private long userId;
    private String label = "";
    private String consoleQuery;
    private String mode = "search";
    private String summary;
    private Instant createdAt = Instant.now();

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getConsoleQuery() {
        return consoleQuery;
    }

    public void setConsoleQuery(String consoleQuery) {
        this.consoleQuery = consoleQuery;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}

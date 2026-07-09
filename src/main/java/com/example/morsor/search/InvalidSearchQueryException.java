package com.example.morsor.search;

/** Thrown when the user search string contains unrecognized {@code field:value} filters. */
public final class InvalidSearchQueryException extends RuntimeException {

    public InvalidSearchQueryException(String message) {
        super(message);
    }
}

package com.example.morsor.auth;

import java.util.Optional;

public interface ApiTokenRepository {

    /** Finds the user associated with the given token hash, if any. */
    Optional<User> findUserByTokenHash(String tokenHash);

    void save(long userId, String tokenHash, String name);

    /** Deletes all tokens belonging to the given user. Returns the number deleted. */
    int deleteAllForUser(long userId);

    /** Deletes a single token by its hash (used to revoke just the caller's own token). */
    void deleteByTokenHash(String tokenHash);
}

package com.example.morsor;

import java.util.Optional;

public interface ApiTokenRepository {

    /** Finds the user associated with the given token hash, if any. */
    Optional<User> findUserByTokenHash(String tokenHash);

    void save(long userId, String tokenHash, String name);
}

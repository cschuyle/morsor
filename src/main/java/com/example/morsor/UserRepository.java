package com.example.morsor;

import java.util.Optional;

public interface UserRepository {

    Optional<User> findByUsername(String username);

    /** Saves the user (insert), sets the generated id on the user, and returns it. */
    User save(User user);
}

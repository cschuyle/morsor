package com.example.morsor.auth;

import java.util.List;

public interface SavedQueryRepository {

    List<SavedQuery> findByUserIdOrderByCreatedAtDesc(long userId);

    long insert(long userId, String label, String consoleQuery, String mode, String summary);

    /** Deletes the row only if it belongs to {@code userId}. Returns number of rows deleted (0 or 1). */
    int deleteByIdAndUserId(long id, long userId);
}

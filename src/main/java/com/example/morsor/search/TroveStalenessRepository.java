package com.example.morsor.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class TroveStalenessRepository {

    private final JdbcTemplate jdbc;

    public TroveStalenessRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Replace any existing stale flag with a new one listing the changed trove ids (comma-delimited). */
    public void markStale(List<String> troveIds) {
        jdbc.update("DELETE FROM trove_staleness");
        String ids = String.join(",", troveIds);
        jdbc.update(
                "INSERT INTO trove_staleness (detected_at, stale_trove_ids) VALUES (?, ?)",
                Timestamp.from(java.time.Instant.now()),
                ids
        );
    }

    /** Returns the current stale record if one exists. */
    public Optional<TroveStaleness> findCurrent() {
        List<TroveStaleness> rows = jdbc.query(
                "SELECT id, detected_at, stale_trove_ids FROM trove_staleness ORDER BY id DESC LIMIT 1",
                (rs, rowNum) -> new TroveStaleness(
                        rs.getLong("id"),
                        rs.getTimestamp("detected_at").toInstant(),
                        rs.getString("stale_trove_ids")
                )
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** Remove the stale flag (called after a successful reload). */
    public void clear() {
        jdbc.update("DELETE FROM trove_staleness");
    }
}

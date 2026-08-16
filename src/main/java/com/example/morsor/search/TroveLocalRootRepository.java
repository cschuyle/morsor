package com.example.morsor.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
public class TroveLocalRootRepository {

    private final JdbcTemplate jdbc;

    public TroveLocalRootRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<TroveLocalRootRow> ROOT_MAPPER = (rs, rowNum) ->
            new TroveLocalRootRow(
                    rs.getString("trove_id"),
                    rs.getString("folder_label"),
                    rs.getTimestamp("connected_at").toInstant().toString());

    public List<TroveLocalRootRow> findAll() {
        return jdbc.query(
                "SELECT trove_id, folder_label, connected_at FROM trove_local_roots ORDER BY trove_id",
                ROOT_MAPPER);
    }

    /** Insert or update the folder label for a trove (last connector wins). */
    public TroveLocalRootRow upsert(String troveId, String folderLabel) {
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE trove_local_roots SET folder_label = ?, connected_at = ? WHERE trove_id = ?",
                folderLabel,
                now,
                troveId);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO trove_local_roots (trove_id, folder_label, connected_at) VALUES (?, ?, ?)",
                    troveId,
                    folderLabel,
                    now);
        }
        return new TroveLocalRootRow(troveId, folderLabel, now.toInstant().toString());
    }

    /** @return rows deleted (0 or 1) */
    public int delete(String troveId) {
        return jdbc.update("DELETE FROM trove_local_roots WHERE trove_id = ?", troveId);
    }
}

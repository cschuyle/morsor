package com.example.morsor.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
public class TroveDirLinkRepository {

    private final JdbcTemplate jdbc;

    public TroveDirLinkRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<TroveDirLinkRow> ROOT_MAPPER = (rs, rowNum) ->
            new TroveDirLinkRow(
                    rs.getString("trove_id"),
                    rs.getString("folder_label"),
                    rs.getTimestamp("connected_at").toInstant().toString());

    public List<TroveDirLinkRow> findAll() {
        return jdbc.query(
                "SELECT trove_id, folder_label, connected_at FROM trove_dir_links ORDER BY trove_id",
                ROOT_MAPPER);
    }

    /** Insert or update the folder label for a trove (last connector wins). */
    public TroveDirLinkRow upsert(String troveId, String folderLabel) {
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE trove_dir_links SET folder_label = ?, connected_at = ? WHERE trove_id = ?",
                folderLabel,
                now,
                troveId);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO trove_dir_links (trove_id, folder_label, connected_at) VALUES (?, ?, ?)",
                    troveId,
                    folderLabel,
                    now);
        }
        return new TroveDirLinkRow(troveId, folderLabel, now.toInstant().toString());
    }

    /** @return rows deleted (0 or 1) */
    public int delete(String troveId) {
        return jdbc.update("DELETE FROM trove_dir_links WHERE trove_id = ?", troveId);
    }
}

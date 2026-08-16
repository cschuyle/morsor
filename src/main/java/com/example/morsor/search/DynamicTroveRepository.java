package com.example.morsor.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class DynamicTroveRepository {

    private final JdbcTemplate jdbc;

    public DynamicTroveRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<DynamicTroveRow> TROVE_MAPPER = (rs, rowNum) ->
            new DynamicTroveRow(
                    rs.getString("id"),
                    rs.getString("name"),
                    rs.getTimestamp("updated_at").toInstant().toString());

    private static final RowMapper<DynamicTroveItemRow> ITEM_MAPPER = (rs, rowNum) ->
            new DynamicTroveItemRow(rs.getString("trove_id"), rs.getString("title"));

    public List<DynamicTroveRow> findAllTroves() {
        return jdbc.query(
                "SELECT id, name, updated_at FROM dynamic_troves ORDER BY LOWER(name)",
                TROVE_MAPPER);
    }

    public Optional<DynamicTroveRow> findTroveById(String id) {
        List<DynamicTroveRow> rows = jdbc.query(
                "SELECT id, name, updated_at FROM dynamic_troves WHERE id = ?",
                TROVE_MAPPER,
                id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<DynamicTroveItemRow> findAllItems() {
        return jdbc.query(
                "SELECT trove_id, title FROM dynamic_trove_items ORDER BY created_at, title",
                ITEM_MAPPER);
    }

    public List<DynamicTroveItemRow> findItemsByTroveId(String troveId) {
        return jdbc.query(
                "SELECT trove_id, title FROM dynamic_trove_items WHERE trove_id = ? ORDER BY created_at, title",
                ITEM_MAPPER,
                troveId);
    }

    public void insertTrove(String id, String name) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
                "INSERT INTO dynamic_troves (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                id,
                name,
                now,
                now);
    }

    /** @return rows deleted (0 or 1) */
    public int deleteTrove(String id) {
        return jdbc.update("DELETE FROM dynamic_troves WHERE id = ?", id);
    }

    /** @return rows updated (0 or 1) */
    public int updateTroveName(String id, String name) {
        return jdbc.update(
                "UPDATE dynamic_troves SET name = ?, updated_at = ? WHERE id = ?",
                name,
                Timestamp.from(Instant.now()),
                id);
    }

    /** Bump a trove's updated_at (e.g. after its items change) without touching its name. */
    public void touchTrove(String id) {
        jdbc.update(
                "UPDATE dynamic_troves SET updated_at = ? WHERE id = ?",
                Timestamp.from(Instant.now()),
                id);
    }

    public void insertItem(String troveId, String title) {
        jdbc.update(
                "INSERT INTO dynamic_trove_items (trove_id, title, created_at) VALUES (?, ?, ?)",
                troveId,
                title,
                Timestamp.from(Instant.now()));
    }

    public void insertItems(String troveId, List<String> titles) {
        if (titles == null || titles.isEmpty()) {
            return;
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.batchUpdate(
                "INSERT INTO dynamic_trove_items (trove_id, title, created_at) VALUES (?, ?, ?)",
                titles,
                titles.size(),
                (ps, title) -> {
                    ps.setString(1, troveId);
                    ps.setString(2, title);
                    ps.setTimestamp(3, now);
                });
    }

    /** @return rows deleted (0 or 1) */
    public int deleteItem(String troveId, String title) {
        return jdbc.update(
                "DELETE FROM dynamic_trove_items WHERE trove_id = ? AND title = ?",
                troveId,
                title);
    }

    public void deleteItems(String troveId, List<String> titles) {
        if (titles == null || titles.isEmpty()) {
            return;
        }
        jdbc.batchUpdate(
                "DELETE FROM dynamic_trove_items WHERE trove_id = ? AND title = ?",
                titles,
                titles.size(),
                (ps, title) -> {
                    ps.setString(1, troveId);
                    ps.setString(2, title);
                });
    }
}

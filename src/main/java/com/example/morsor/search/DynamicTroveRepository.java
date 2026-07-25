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
            new DynamicTroveRow(rs.getString("id"), rs.getString("name"));

    private static final RowMapper<DynamicTroveItemRow> ITEM_MAPPER = (rs, rowNum) ->
            new DynamicTroveItemRow(rs.getString("id"), rs.getString("trove_id"), rs.getString("title"));

    public List<DynamicTroveRow> findAllTroves() {
        return jdbc.query(
                "SELECT id, name FROM dynamic_troves ORDER BY LOWER(name)",
                TROVE_MAPPER);
    }

    public Optional<DynamicTroveRow> findTroveById(String id) {
        List<DynamicTroveRow> rows = jdbc.query(
                "SELECT id, name FROM dynamic_troves WHERE id = ?",
                TROVE_MAPPER,
                id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<DynamicTroveItemRow> findAllItems() {
        return jdbc.query(
                "SELECT id, trove_id, title FROM dynamic_trove_items ORDER BY created_at, id",
                ITEM_MAPPER);
    }

    public List<DynamicTroveItemRow> findItemsByTroveId(String troveId) {
        return jdbc.query(
                "SELECT id, trove_id, title FROM dynamic_trove_items WHERE trove_id = ? ORDER BY created_at, id",
                ITEM_MAPPER,
                troveId);
    }

    public void insertTrove(String id, String name) {
        jdbc.update(
                "INSERT INTO dynamic_troves (id, name, created_at) VALUES (?, ?, ?)",
                id,
                name,
                Timestamp.from(Instant.now()));
    }

    /** @return rows deleted (0 or 1) */
    public int deleteTrove(String id) {
        return jdbc.update("DELETE FROM dynamic_troves WHERE id = ?", id);
    }

    public void insertItem(String id, String troveId, String title) {
        jdbc.update(
                "INSERT INTO dynamic_trove_items (id, trove_id, title, created_at) VALUES (?, ?, ?, ?)",
                id,
                troveId,
                title,
                Timestamp.from(Instant.now()));
    }

    /** @return rows deleted (0 or 1) */
    public int deleteItem(String troveId, String itemId) {
        return jdbc.update(
                "DELETE FROM dynamic_trove_items WHERE trove_id = ? AND id = ?",
                troveId,
                itemId);
    }
}

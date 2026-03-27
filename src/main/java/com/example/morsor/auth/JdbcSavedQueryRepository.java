package com.example.morsor.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Repository
public class JdbcSavedQueryRepository implements SavedQueryRepository {

    private static final int MAX_CONSOLE_QUERY_CHARS = 8192;
    private static final int MAX_LABEL_CHARS = 512;
    private static final int MAX_SUMMARY_CHARS = 512;

    private final JdbcTemplate jdbc;

    public JdbcSavedQueryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<SavedQuery> ROW_MAPPER = (rs, rowNum) -> {
        SavedQuery q = new SavedQuery();
        q.setId(rs.getLong("id"));
        q.setUserId(rs.getLong("user_id"));
        q.setLabel(rs.getString("label"));
        q.setConsoleQuery(rs.getString("console_query"));
        q.setMode(rs.getString("mode"));
        q.setSummary(rs.getString("summary"));
        var ts = rs.getTimestamp("created_at");
        q.setCreatedAt(ts != null ? ts.toInstant() : null);
        return q;
    };

    @Override
    public List<SavedQuery> findByUserIdOrderByCreatedAtDesc(long userId) {
        String sql = "SELECT id, user_id, label, console_query, mode, summary, created_at FROM saved_queries "
                + "WHERE user_id = ? ORDER BY created_at DESC";
        return jdbc.query(sql, ROW_MAPPER, userId);
    }

    @Override
    public long insert(long userId, String label, String consoleQuery, String mode, String summary) {
        String l = truncate(label, MAX_LABEL_CHARS);
        String cq = truncate(consoleQuery, MAX_CONSOLE_QUERY_CHARS);
        String m = mode != null && !mode.isBlank() ? truncate(mode, 32) : "search";
        String s = summary != null ? truncate(summary, MAX_SUMMARY_CHARS) : null;
        String sql = "INSERT INTO saved_queries (user_id, label, console_query, mode, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)";
        var keyHolder = new GeneratedKeyHolder();
        Instant now = Instant.now();
        jdbc.update(con -> {
            var ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, userId);
            ps.setString(2, l);
            ps.setString(3, cq);
            ps.setString(4, m);
            ps.setString(5, s);
            ps.setTimestamp(6, Timestamp.from(now));
            return ps;
        }, keyHolder);
        Map<String, Object> keys = keyHolder.getKeys();
        if (keys != null) {
            Object idObj = keys.get("ID");
            if (idObj == null) {
                idObj = keys.get("id");
            }
            if (idObj instanceof Number num) {
                return num.longValue();
            }
        }
        throw new IllegalStateException("saved_queries insert did not return generated key");
    }

    @Override
    public int deleteByIdAndUserId(long id, long userId) {
        return jdbc.update("DELETE FROM saved_queries WHERE id = ? AND user_id = ?", id, userId);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        if (value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}

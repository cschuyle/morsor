package com.example.morsor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

@Repository
public class JdbcUserRepository implements UserRepository {

    private final JdbcTemplate jdbc;

    public JdbcUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<User> ROW_MAPPER = (rs, rowNum) -> {
        User u = new User();
        u.setId(rs.getLong("id"));
        u.setUsername(rs.getString("username"));
        u.setPasswordHash(rs.getString("password_hash"));
        u.setEnabled(rs.getBoolean("enabled"));
        u.setCreatedAt(instant(rs, "created_at"));
        return u;
    };

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var ts = rs.getTimestamp(column);
        return ts != null ? ts.toInstant() : null;
    }

    @Override
    public Optional<User> findByUsername(String username) {
        String sql = "SELECT id, username, password_hash, enabled, created_at FROM users WHERE username = ?";
        return jdbc.query(sql, ROW_MAPPER, username).stream().findFirst();
    }

    @Override
    public User save(User user) {
        String sql = "INSERT INTO users (username, password_hash, enabled, created_at) VALUES (?, ?, ?, ?)";
        var keyHolder = new GeneratedKeyHolder();
        Instant created = user.getCreatedAt() != null ? user.getCreatedAt() : Instant.now();
        jdbc.update(con -> {
            var ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, user.getUsername());
            ps.setString(2, user.getPasswordHash());
            ps.setBoolean(3, user.isEnabled());
            ps.setTimestamp(4, Timestamp.from(created));
            return ps;
        }, keyHolder);
        Map<String, Object> keys = keyHolder.getKeys();
        if (keys != null) {
            Object idObj = keys.get("ID");
            if (idObj == null) idObj = keys.get("id");
            if (idObj instanceof Number num) {
                user.setId(num.longValue());
            }
        }
        return user;
    }
}

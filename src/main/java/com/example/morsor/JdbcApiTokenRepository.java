package com.example.morsor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
public class JdbcApiTokenRepository implements ApiTokenRepository {

    private final JdbcTemplate jdbc;

    public JdbcApiTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<User> USER_ROW_MAPPER = (rs, rowNum) -> {
        User u = new User();
        u.setId(rs.getLong("u_id"));
        u.setUsername(rs.getString("u_username"));
        u.setPasswordHash(rs.getString("u_password_hash"));
        u.setEnabled(rs.getBoolean("u_enabled"));
        var ts = rs.getTimestamp("u_created_at");
        u.setCreatedAt(ts != null ? ts.toInstant() : null);
        return u;
    };

    @Override
    public Optional<User> findUserByTokenHash(String tokenHash) {
        String sql = "SELECT u.id AS u_id, u.username AS u_username, u.password_hash AS u_password_hash, u.enabled AS u_enabled, u.created_at AS u_created_at "
                + "FROM users u JOIN api_tokens t ON t.user_id = u.id WHERE t.token_hash = ?";
        return jdbc.query(sql, USER_ROW_MAPPER, tokenHash).stream().findFirst();
    }

    @Override
    public void save(long userId, String tokenHash, String name) {
        String sql = "INSERT INTO api_tokens (user_id, token_hash, name, created_at) VALUES (?, ?, ?, ?)";
        jdbc.update(sql, userId, tokenHash, name != null ? name : "", Timestamp.from(Instant.now()));
    }
}

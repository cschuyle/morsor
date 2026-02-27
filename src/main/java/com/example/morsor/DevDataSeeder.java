package com.example.morsor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.SQLException;

/**
 * Seeds H2 when postgres profile is not active: creates auth tables (H2-compatible DDL) and inserts
 * a single user plus hardwired API token (form: dev / dev or Authorization: Bearer dev-token).
 * Skips if the datasource is not H2 (e.g. postgres profile overrides to Postgres).
 */
@Component
@Profile("!postgres")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private final JdbcTemplate jdbc;
    private final DataSource dataSource;
    private final UserRepository userRepository;
    private final ApiTokenRepository apiTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenHashService tokenHashService;

    @Value("${app.dev.username:dev}")
    private String devUsername;

    @Value("${app.dev.password:dev}")
    private String devPassword;

    @Value("${app.dev.api-token:dev-token}")
    private String devApiToken;

    public DevDataSeeder(JdbcTemplate jdbc,
                         DataSource dataSource,
                         UserRepository userRepository,
                         ApiTokenRepository apiTokenRepository,
                         PasswordEncoder passwordEncoder,
                         TokenHashService tokenHashService) {
        this.jdbc = jdbc;
        this.dataSource = dataSource;
        this.userRepository = userRepository;
        this.apiTokenRepository = apiTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenHashService = tokenHashService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!isH2()) {
            log.debug("DevDataSeeder skipped: datasource is not H2 (postgres profile active)");
            return;
        }
        createTablesIfNeeded();
        if (userRepository.findByUsername(devUsername).isPresent()) {
            return;
        }
        User user = new User();
        user.setUsername(devUsername);
        user.setPasswordHash(passwordEncoder.encode(devPassword));
        user.setEnabled(true);
        user = userRepository.save(user);

        String tokenHash = tokenHashService.hash(devApiToken);
        apiTokenRepository.save(user.getId(), tokenHash, "dev");
        log.info("Dev data seeded: user '{}' / password '{}', API token '{}' (use Authorization: Bearer <token>)", devUsername, devPassword, devApiToken);
    }

    private boolean isH2() {
        try (var conn = dataSource.getConnection()) {
            String url = conn.getMetaData().getURL();
            return url != null && url.startsWith("jdbc:h2:");
        } catch (SQLException e) {
            log.warn("DevDataSeeder could not determine datasource URL: {}", e.getMessage());
            return false;
        }
    }

    private void createTablesIfNeeded() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS users ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "username VARCHAR(255) NOT NULL UNIQUE, "
                + "password_hash VARCHAR(255) NOT NULL, "
                + "enabled BOOLEAN NOT NULL DEFAULT true, "
                + "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS api_tokens ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "user_id BIGINT NOT NULL, "
                + "token_hash VARCHAR(255) NOT NULL UNIQUE, "
                + "name VARCHAR(255), "
                + "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                + "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)");
    }
}

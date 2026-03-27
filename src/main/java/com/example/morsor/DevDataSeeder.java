package com.example.morsor;

import com.example.morsor.auth.ApiTokenRepository;
import com.example.morsor.auth.TokenHashService;
import com.example.morsor.auth.User;
import com.example.morsor.auth.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.SQLException;

/**
 * Seeds H2 when postgres profile is not active: inserts a dev user plus hardwired API token
 * (form: dev / dev or Authorization: Bearer dev-token). Tables are created by Flyway ({@code db/migration/h2+postgres}).
 * Skips if the datasource is not H2 (e.g. postgres profile overrides to Postgres).
 */
@Component
@Profile("!postgres")
@Order(0)
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

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

    public DevDataSeeder(DataSource dataSource,
                         UserRepository userRepository,
                         ApiTokenRepository apiTokenRepository,
                         PasswordEncoder passwordEncoder,
                         TokenHashService tokenHashService) {
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
}

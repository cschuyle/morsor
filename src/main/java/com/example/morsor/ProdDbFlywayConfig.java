package com.example.morsor;

import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Profile proddb: a local run pointed at the production database (see {@code bootrun-proddb.sh}).
 * Flyway only validates instead of migrating, so a local build with an unreleased migration fails
 * fast at startup rather than changing the prod schema.
 */
@Configuration
@Profile("proddb")
public class ProdDbFlywayConfig {

    @Bean
    public FlywayMigrationStrategy validateOnlyFlywayMigrationStrategy() {
        return flyway -> flyway.validate();
    }
}

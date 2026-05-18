package com.example.morsor.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Profile {@code no-auth}: permit all requests without login or API tokens.
 * Use only in trusted local environments, e.g. {@code SPRING_PROFILES_ACTIVE=dev,no-auth}.
 */
@Configuration
@EnableWebSecurity
@Profile("no-auth")
public class NoAuthSecurityConfig {

    @Bean
    @Order(0)
    public SecurityFilterChain noAuthSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .csrf(AbstractHttpConfigurer::disable);
        return http.build();
    }
}

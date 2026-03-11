package com.example.morsor.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.util.matcher.RequestMatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final CustomUserDetailsService userDetailsService;
    private final ApiTokenAuthenticationFilter apiTokenAuthenticationFilter;

    public SecurityConfig(CustomUserDetailsService userDetailsService,
                          ApiTokenAuthenticationFilter apiTokenAuthenticationFilter) {
        this.userDetailsService = userDetailsService;
        this.apiTokenAuthenticationFilter = apiTokenAuthenticationFilter;
    }

    @Value("${app.cors.allowed-origins:}")
    private String allowedOriginsConfig;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("X-XSRF-TOKEN"));
        if (allowedOriginsConfig != null && !allowedOriginsConfig.isBlank()) {
            config.setAllowedOrigins(List.of(allowedOriginsConfig.trim().split("\\s*,\\s*")));
        } else {
            config.setAllowedOriginPatterns(List.of("http://localhost:*", "http://127.0.0.1:*"));
        }
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // CSRF in cookie so SPA can read and send X-XSRF-TOKEN header
        var csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
        var requestHandler = new CsrfTokenRequestAttributeHandler();
        requestHandler.setCsrfRequestAttributeName("_csrf");

        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf
                .csrfTokenRepository(csrfRepo)
                .csrfTokenRequestHandler(requestHandler))

            // Cursor let me get away with this wihtout noticing a thing. Baaaad Cursor! Also, Bad Me for trusting it
            // .authorizeHttpRequests(auth -> auth
            //     .requestMatchers("/api/**").access(new StreamAwareAuthorizationManager())
            //     .anyRequest().permitAll())

            // This is the correct way to do it, usually. Except I'm using Vite.
            // .authorizeHttpRequests(auth -> auth
            //     .requestMatchers("/login", "/css/**", "/js/**", "/images/**").permitAll()
            //     .requestMatchers("/api/**").access(new StreamAwareAuthorizationManager())
            //     .anyRequest().authenticated()
            // )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/favicon.ico").permitAll()
                .requestMatchers("/assets/**").permitAll() // Because, Vite.
                .requestMatchers("/@vite/**").permitAll() // Because, Vite.
                .requestMatchers("/api/**").access(new StreamAwareAuthorizationManager())
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .defaultAuthenticationEntryPointFor(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                    (RequestMatcher) request -> request.getRequestURI().startsWith("/api/")))
            .formLogin(form -> form
                .loginPage("/login")
                .permitAll()
                .defaultSuccessUrl("/", true))
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID", "XSRF-TOKEN")
                .permitAll()
            )
            .userDetailsService(userDetailsService)
            .addFilterBefore(new ResponseCapturingFilter(), AuthorizationFilter.class)
            .addFilterBefore(apiTokenAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

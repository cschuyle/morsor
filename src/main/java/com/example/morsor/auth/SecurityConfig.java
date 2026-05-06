package com.example.morsor.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.cors.allowed-origins:}")
    private String allowedOriginsConfig;

    private final CustomUserDetailsService userDetailsService;
    private final ApiTokenAuthenticationFilter apiTokenAuthenticationFilter;

    public SecurityConfig(CustomUserDetailsService userDetailsService,
                          ApiTokenAuthenticationFilter apiTokenAuthenticationFilter) {
        this.userDetailsService = userDetailsService;
        this.apiTokenAuthenticationFilter = apiTokenAuthenticationFilter;
    }

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
                .csrfTokenRequestHandler(requestHandler)
                // CLI and other stateless clients use Bearer only (no X-XSRF-TOKEN cookie flow).
                .ignoringRequestMatchers(bearerTokenPresentMatcher()))

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
                .requestMatchers(HttpMethod.GET, "/api/auth/csrf-prime").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/session").permitAll()
                .requestMatchers("/login", "/favicon.ico", "/favicon.png", "/apple-touch-icon.png").permitAll()
                .requestMatchers("/assets/**").permitAll() // Because, Vite.
                .requestMatchers("/@vite/**").permitAll() // Because, Vite.
                .requestMatchers("/api/**").access(new StreamAwareAuthorizationManager())
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    if (isApiRequestPath(request)) {
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
                                .commence(request, response, authException);
                        return;
                    }
                    String next = request.getRequestURI();
                    String query = request.getQueryString();
                    if (query != null && !query.isBlank()) {
                        next += "?" + query;
                    }
                    String encodedNext = UriUtils.encode(next, StandardCharsets.UTF_8);
                    new LoginUrlAuthenticationEntryPoint("/login?next=" + encodedNext)
                            .commence(request, response, authException);
                }))
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

    private static RequestMatcher bearerTokenPresentMatcher() {
        return request -> {
            String auth = request.getHeader("Authorization");
            return auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7);
        };
    }

    /** Path after context path, so /api/** is recognized when the app has a non-root context. */
    static boolean isApiRequestPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            uri = uri.substring(context.length());
        }
        return uri.startsWith("/api/");
    }
}


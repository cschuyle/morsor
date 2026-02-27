package com.example.morsor;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Stateless API token auth: if request has Authorization: Bearer &lt;token&gt;,
 * hash the token, look up in DB, and set the principal. Otherwise the request
 * continues (e.g. form login / session).
 */
@Component
public class ApiTokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION = "Authorization";
    private static final String BEARER = "Bearer ";

    private final ApiTokenRepository apiTokenRepository;
    private final TokenHashService tokenHashService;

    public ApiTokenAuthenticationFilter(ApiTokenRepository apiTokenRepository,
                                         TokenHashService tokenHashService) {
        this.apiTokenRepository = apiTokenRepository;
        this.tokenHashService = tokenHashService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader(AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith(BEARER)) {
            String token = authHeader.substring(BEARER.length()).trim();
            if (!token.isEmpty()) {
                String hash = tokenHashService.hash(token);
                apiTokenRepository.findUserByTokenHash(hash)
                        .filter(User::isEnabled)
                        .ifPresent(user -> {
                            var auth = new UsernamePasswordAuthenticationToken(
                                    user.getUsername(),
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))
                            );
                            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        });
            }
        }
        filterChain.doFilter(request, response);
    }
}

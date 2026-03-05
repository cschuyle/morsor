package com.example.morsor.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Stores the response in a request attribute so authorization can check
 * response.isCommitted() (e.g. to avoid Access Denied during streaming).
 */
public class ResponseCapturingFilter extends OncePerRequestFilter {

    public static final String REQUEST_ATTR_RESPONSE = "morsor.servletResponse";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        request.setAttribute(REQUEST_ATTR_RESPONSE, response);
        filterChain.doFilter(request, response);
    }
}

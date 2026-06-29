package com.example.order.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.Map;

@Component
@Order(1)
public class AuthValidationFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(AuthValidationFilter.class);

    private final RestClient restClient;

    public AuthValidationFilter(@Value("${services.auth-url}") String authServiceUrl,
            RestClient.Builder builder) {
        this.restClient = builder.baseUrl(authServiceUrl).build();
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        // Skip auth for actuator and Swagger/OpenAPI endpoints
        String uri = request.getRequestURI();
        if (uri.startsWith("/actuator") || uri.startsWith("/swagger-ui") || uri.startsWith("/v3/api-docs")) {
            chain.doFilter(request, response);
            return;
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"Missing or invalid Authorization header\"}");
            return;
        }

        String token = authHeader.substring(7);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> validationResult = restClient.post()
                    .uri("/auth/validate")
                    .body(Map.of("token", token))
                    .retrieve()
                    .body(Map.class);

            if (validationResult == null || !Boolean.TRUE.equals(validationResult.get("valid"))) {
                log.warn("Token validation failed");
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.getWriter().write("{\"error\":\"Invalid token\"}");
                return;
            }

            request.setAttribute("username", validationResult.get("username"));
            chain.doFilter(request, response);
        } catch (Exception e) {
            log.error("Error validating token with auth-service", e);
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.getWriter().write("{\"error\":\"Auth service unavailable\"}");
        }
    }
}

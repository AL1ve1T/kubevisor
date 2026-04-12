package com.example.auth.service;

import com.example.auth.dto.LoginRequest;
import com.example.auth.dto.LoginResponse;
import com.example.auth.dto.TokenValidationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final JwtUtil jwtUtil;

    // Demo in-memory user store
    private static final Map<String, String> USERS = Map.of(
            "alice", "password123",
            "bob", "password456",
            "charlie", "password789");

    public AuthService(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    public LoginResponse login(LoginRequest request) {
        String storedPassword = USERS.get(request.username());
        if (storedPassword == null || !storedPassword.equals(request.password())) {
            log.warn("Failed login attempt for user: {}", request.username());
            throw new InvalidCredentialsException("Invalid username or password");
        }

        String token = jwtUtil.generateToken(request.username());
        log.info("User '{}' logged in successfully", request.username());
        return new LoginResponse(token);
    }

    public TokenValidationResponse validateToken(String token) {
        String username = jwtUtil.validateTokenAndGetUsername(token);
        if (username != null) {
            log.debug("Token validated for user: {}", username);
            return new TokenValidationResponse(true, username);
        }
        log.debug("Token validation failed");
        return new TokenValidationResponse(false, null);
    }
}

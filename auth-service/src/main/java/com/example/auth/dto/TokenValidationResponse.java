package com.example.auth.dto;

public record TokenValidationResponse(boolean valid, String username) {
}

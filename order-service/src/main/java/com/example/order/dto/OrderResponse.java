package com.example.order.dto;

import java.time.Instant;

public record OrderResponse(Long id, String customerName, String eventName, int quantity, String status,
        Instant createdAt) {
}

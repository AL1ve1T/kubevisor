package com.example.ticket.dto;

import java.time.Instant;

public record TicketResponse(Long id, Long orderId, String eventName, String seatNumber, String status,
        Instant issuedAt) {
}

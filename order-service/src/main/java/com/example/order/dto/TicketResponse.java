package com.example.order.dto;

public record TicketResponse(Long id, Long orderId, String eventName, String seatNumber, String status) {
}

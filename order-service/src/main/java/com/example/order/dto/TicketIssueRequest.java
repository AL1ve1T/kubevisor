package com.example.order.dto;

public record TicketIssueRequest(Long orderId, String eventName, int quantity) {
}

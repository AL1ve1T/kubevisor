package com.example.ticket.dto;

public record TicketIssueRequest(Long orderId, String eventName, int quantity) {
}

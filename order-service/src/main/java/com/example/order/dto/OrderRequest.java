package com.example.order.dto;

public record OrderRequest(String customerName, String eventName, int quantity) {
}

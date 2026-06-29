package com.example.ticket.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class EmailNotificationService {

    private static final Logger log = LoggerFactory.getLogger(EmailNotificationService.class);

    public void sendTicketConfirmation(String eventName, String seatNumber, Long orderId) {
        log.info("Sending confirmation email for order={}, event='{}', seat={}", orderId, eventName, seatNumber);
        try {
            // Artificial delay to simulate email sending — produces realistic trace spans
            Thread.sleep(50 + (long) (Math.random() * 100));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        log.info("Confirmation email sent for order={}, seat={}", orderId, seatNumber);
    }
}

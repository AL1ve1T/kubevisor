package com.example.ticket.service;

import com.example.ticket.dto.TicketIssueRequest;
import com.example.ticket.dto.TicketResponse;
import com.example.ticket.entity.Ticket;
import com.example.ticket.repository.TicketRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class TicketService {

    private static final Logger log = LoggerFactory.getLogger(TicketService.class);

    private final TicketRepository ticketRepository;
    private final EmailNotificationService emailNotificationService;

    public TicketService(TicketRepository ticketRepository, EmailNotificationService emailNotificationService) {
        this.ticketRepository = ticketRepository;
        this.emailNotificationService = emailNotificationService;
    }

    public List<TicketResponse> issueTickets(TicketIssueRequest request) {
        log.info("Issuing {} ticket(s) for orderId={}, event='{}'", request.quantity(), request.orderId(),
                request.eventName());

        List<Ticket> tickets = new ArrayList<>();
        for (int i = 1; i <= request.quantity(); i++) {
            Ticket ticket = new Ticket();
            ticket.setOrderId(request.orderId());
            ticket.setEventName(request.eventName());
            ticket.setSeatNumber(generateSeatNumber(i));
            tickets.add(ticketRepository.save(ticket));
        }

        // Send confirmation emails for each ticket (mocked)
        for (Ticket ticket : tickets) {
            emailNotificationService.sendTicketConfirmation(
                    ticket.getEventName(), ticket.getSeatNumber(), ticket.getOrderId());
        }

        log.info("Issued {} ticket(s) for orderId={}", tickets.size(), request.orderId());
        return tickets.stream().map(this::toResponse).toList();
    }

    public TicketResponse getTicket(Long id) {
        return ticketRepository.findById(id)
                .map(this::toResponse)
                .orElse(null);
    }

    public List<TicketResponse> getTicketsByOrderId(Long orderId) {
        return ticketRepository.findByOrderId(orderId).stream()
                .map(this::toResponse)
                .toList();
    }

    private String generateSeatNumber(int index) {
        char row = (char) ('A' + (index - 1) / 10);
        int seat = ((index - 1) % 10) + 1;
        return String.valueOf(row) + seat;
    }

    private TicketResponse toResponse(Ticket ticket) {
        return new TicketResponse(ticket.getId(), ticket.getOrderId(), ticket.getEventName(),
                ticket.getSeatNumber(), ticket.getStatus(), ticket.getIssuedAt());
    }
}

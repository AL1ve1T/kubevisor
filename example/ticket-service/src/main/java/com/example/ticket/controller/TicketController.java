package com.example.ticket.controller;

import com.example.ticket.dto.TicketIssueRequest;
import com.example.ticket.dto.TicketResponse;
import com.example.ticket.service.TicketService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

    private final TicketService ticketService;

    public TicketController(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    @PostMapping
    public ResponseEntity<List<TicketResponse>> issueTickets(@RequestBody TicketIssueRequest request) {
        List<TicketResponse> tickets = ticketService.issueTickets(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(tickets);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TicketResponse> getTicket(@PathVariable Long id) {
        TicketResponse response = ticketService.getTicket(id);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<TicketResponse>> getTicketsByOrderId(@RequestParam Long orderId) {
        return ResponseEntity.ok(ticketService.getTicketsByOrderId(orderId));
    }
}

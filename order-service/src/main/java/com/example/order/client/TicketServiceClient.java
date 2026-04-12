package com.example.order.client;

import com.example.order.dto.TicketIssueRequest;
import com.example.order.dto.TicketResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

@Component
public class TicketServiceClient {

    private static final Logger log = LoggerFactory.getLogger(TicketServiceClient.class);

    private final RestClient restClient;

    public TicketServiceClient(@Value("${services.ticket-url}") String ticketServiceUrl,
            RestClient.Builder builder) {
        this.restClient = builder.baseUrl(ticketServiceUrl).build();
    }

    public List<TicketResponse> issueTickets(TicketIssueRequest request) {
        log.info("Requesting ticket issuance for orderId={}, quantity={}", request.orderId(), request.quantity());
        return restClient.post()
                .uri("/api/tickets")
                .body(request)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });
    }
}

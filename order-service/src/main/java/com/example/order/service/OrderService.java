package com.example.order.service;

import com.example.order.client.TicketServiceClient;
import com.example.order.dto.*;
import com.example.order.entity.Order;
import com.example.order.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderRepository orderRepository;
    private final TicketServiceClient ticketServiceClient;

    public OrderService(OrderRepository orderRepository, TicketServiceClient ticketServiceClient) {
        this.orderRepository = orderRepository;
        this.ticketServiceClient = ticketServiceClient;
    }

    public OrderResponse createOrder(OrderRequest request) {
        Order order = new Order();
        order.setCustomerName(request.customerName());
        order.setEventName(request.eventName());
        order.setQuantity(request.quantity());
        order = orderRepository.save(order);
        log.info("Order created: id={}, customer={}, event={}", order.getId(), order.getCustomerName(),
                order.getEventName());

        try {
            TicketIssueRequest ticketRequest = new TicketIssueRequest(order.getId(), order.getEventName(),
                    order.getQuantity());
            ticketServiceClient.issueTickets(ticketRequest);
            order.setStatus("CONFIRMED");
            order = orderRepository.save(order);
            log.info("Order confirmed: id={}", order.getId());
        } catch (Exception e) {
            log.error("Failed to issue tickets for order id={}", order.getId(), e);
            order.setStatus("FAILED");
            order = orderRepository.save(order);
        }

        return toResponse(order);
    }

    public OrderResponse getOrder(Long id) {
        return orderRepository.findById(id)
                .map(this::toResponse)
                .orElse(null);
    }

    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    private OrderResponse toResponse(Order order) {
        return new OrderResponse(order.getId(), order.getCustomerName(), order.getEventName(),
                order.getQuantity(), order.getStatus(), order.getCreatedAt());
    }
}

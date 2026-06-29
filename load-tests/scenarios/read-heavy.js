import http from "k6/http";
import { check, sleep } from "k6";
import { CONFIG, randomInt } from "../config.js";
import { loginRandomUser, authHeaders } from "../helpers/auth.js";

/**
 * Read-Heavy: Primarily GET requests for orders and tickets.
 *
 * Simulates users browsing their orders and checking ticket details.
 * First seeds some orders, then hammers read endpoints.
 */
export const options = {
    scenarios: {
        seed_data: {
            executor: "shared-iterations",
            vus: 3,
            iterations: 15,
            exec: "seedOrders",
            maxDuration: "30s",
        },
        read_load: {
            executor: "constant-vus",
            vus: 20,
            duration: "2m",
            exec: "readWorkload",
            startTime: "35s",
        },
    },
    thresholds: {
        ...CONFIG.thresholds,
        "http_req_duration{name:list_orders}": ["p(95)<1000"],
        "http_req_duration{name:get_order}": ["p(95)<500"],
        "http_req_duration{name:get_tickets_by_order}": ["p(95)<500"],
    },
};

// Shared array to collect created order IDs
const orderIds = [];

export function seedOrders() {
    const { token } = loginRandomUser();
    const headers = authHeaders(token);

    const events = CONFIG.events;
    const eventName = events[(__ITER % events.length)];

    const res = http.post(
        `${CONFIG.baseUrls.order}/api/orders`,
        JSON.stringify({
            customerName: `Seed-${__VU}-${__ITER}`,
            eventName: eventName,
            quantity: randomInt(1, 4),
        }),
        { headers, tags: { name: "seed_order" } }
    );

    if (res.status === 201 && res.body) {
        orderIds.push(res.json("id"));
    }
}

export function readWorkload() {
    const { token } = loginRandomUser();
    const headers = authHeaders(token);

    // List all orders
    const listRes = http.get(`${CONFIG.baseUrls.order}/api/orders`, {
        headers,
        tags: { name: "list_orders" },
    });

    check(listRes, {
        "list orders 200": (r) => r.status === 200,
        "returns array": (r) => r.body && Array.isArray(r.json()),
    });

    if (listRes.status !== 200 || !listRes.body) {
        sleep(1);
        return;
    }

    const orders = listRes.json();
    if (!Array.isArray(orders) || orders.length === 0) {
        sleep(1);
        return;
    }

    sleep(0.3);

    // Get a random order
    const order = orders[randomInt(0, orders.length - 1)];
    const getRes = http.get(
        `${CONFIG.baseUrls.order}/api/orders/${order.id}`,
        { headers, tags: { name: "get_order" } }
    );

    check(getRes, {
        "get order 200": (r) => r.status === 200,
    });

    sleep(0.3);

    // Get tickets for that order
    const ticketsRes = http.get(
        `${CONFIG.baseUrls.ticket}/api/tickets?orderId=${order.id}`,
        { tags: { name: "get_tickets_by_order" } }
    );

    check(ticketsRes, {
        "get tickets 200": (r) => r.status === 200,
    });

    sleep(0.5);
}

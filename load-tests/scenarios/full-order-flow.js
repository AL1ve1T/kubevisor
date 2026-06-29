import http from "k6/http";
import { check, sleep } from "k6";
import { CONFIG, randomItem, randomInt } from "../config.js";
import { loginRandomUser, authHeaders } from "../helpers/auth.js";

/**
 * Full Order Flow: Login → Create Order → Verify Order → Check Tickets
 *
 * Simulates a complete user journey through the ticketing system.
 * Each VU logs in, creates an order (which triggers ticket issuance
 * and mocked email sending), then verifies the order and tickets.
 */
export const options = {
    scenarios: {
        full_order_flow: {
            executor: "ramping-vus",
            startVUs: 1,
            stages: [
                { duration: "30s", target: 10 },
                { duration: "1m", target: 10 },
                { duration: "30s", target: 25 },
                { duration: "1m", target: 25 },
                { duration: "30s", target: 0 },
            ],
        },
    },
    thresholds: CONFIG.thresholds,
};

export default function () {
    // Step 1: Login
    const { token } = loginRandomUser();
    const headers = authHeaders(token);

    sleep(1);

    // Step 2: Create order
    const eventName = randomItem(CONFIG.events);
    const quantity = randomInt(1, 5);

    const orderRes = http.post(
        `${CONFIG.baseUrls.order}/api/orders`,
        JSON.stringify({
            customerName: `LoadTestUser-${__VU}`,
            eventName: eventName,
            quantity: quantity,
        }),
        { headers, tags: { name: "create_order" } }
    );

    const orderCreated = check(orderRes, {
        "order status 201": (r) => r.status === 201,
        "order has id": (r) => r.body && r.json("id") !== undefined,
        "order status confirmed": (r) => r.body && r.json("status") === "CONFIRMED",
    });

    if (!orderCreated) {
        console.error(`Order creation failed: ${orderRes.status} ${orderRes.body}`);
        return;
    }

    const orderId = orderRes.json("id");

    sleep(0.5);

    // Step 3: Verify order by GET
    const getOrderRes = http.get(
        `${CONFIG.baseUrls.order}/api/orders/${orderId}`,
        { headers, tags: { name: "get_order" } }
    );

    check(getOrderRes, {
        "get order status 200": (r) => r.status === 200,
        "order id matches": (r) => r.body && r.json("id") === orderId,
    });

    sleep(0.5);

    // Step 4: Check tickets for the order
    const ticketsRes = http.get(
        `${CONFIG.baseUrls.ticket}/api/tickets?orderId=${orderId}`,
        { tags: { name: "get_tickets" } }
    );

    check(ticketsRes, {
        "tickets status 200": (r) => r.status === 200,
        "correct ticket count": (r) => r.body && r.json().length === quantity,
    });

    sleep(1);
}

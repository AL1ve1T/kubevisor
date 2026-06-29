import http from "k6/http";
import { check, sleep } from "k6";
import { CONFIG, randomItem, randomInt } from "../config.js";
import { loginRandomUser, authHeaders } from "../helpers/auth.js";

/**
 * Mixed Workload: Realistic traffic pattern.
 *
 * Distribution: 70% reads, 20% order creation, 10% auth-only
 * Simulates normal production-like traffic against the ticketing system.
 */
export const options = {
    scenarios: {
        mixed: {
            executor: "ramping-vus",
            startVUs: 2,
            stages: [
                { duration: "30s", target: 15 },
                { duration: "2m", target: 15 },
                { duration: "30s", target: 30 },
                { duration: "1m", target: 30 },
                { duration: "30s", target: 0 },
            ],
        },
    },
    thresholds: CONFIG.thresholds,
};

export default function () {
    const dice = Math.random();

    if (dice < 0.1) {
        authOnly();
    } else if (dice < 0.3) {
        createOrder();
    } else {
        readOrders();
    }
}

function authOnly() {
    const user = randomItem(CONFIG.users);

    const loginRes = http.post(
        `${CONFIG.baseUrls.auth}/auth/login`,
        JSON.stringify({ username: user.username, password: user.password }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
    );

    check(loginRes, {
        "login 200": (r) => r.status === 200,
    });

    if (loginRes.status !== 200) return;

    const validateRes = http.post(
        `${CONFIG.baseUrls.auth}/auth/validate`,
        JSON.stringify({ token: loginRes.json("token") }),
        {
            headers: { "Content-Type": "application/json" },
            tags: { name: "validate" },
        }
    );

    check(validateRes, {
        "validate 200": (r) => r.status === 200,
    });

    sleep(0.5);
}

function createOrder() {
    const { token } = loginRandomUser();
    const headers = authHeaders(token);

    const orderRes = http.post(
        `${CONFIG.baseUrls.order}/api/orders`,
        JSON.stringify({
            customerName: `MixedUser-${__VU}`,
            eventName: randomItem(CONFIG.events),
            quantity: randomInt(1, 5),
        }),
        { headers, tags: { name: "create_order" } }
    );

    const orderOk = check(orderRes, {
        "order created 201": (r) => r.status === 201,
        "order confirmed": (r) => r.body && r.json("status") === "CONFIRMED",
    });

    if (!orderOk) return;

    sleep(1);
}

function readOrders() {
    const { token } = loginRandomUser();
    const headers = authHeaders(token);

    const listRes = http.get(`${CONFIG.baseUrls.order}/api/orders`, {
        headers,
        tags: { name: "list_orders" },
    });

    check(listRes, {
        "list orders 200": (r) => r.status === 200,
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

    // Pick a random order and fetch its details + tickets
    const order = orders[randomInt(0, orders.length - 1)];

    const getRes = http.get(
        `${CONFIG.baseUrls.order}/api/orders/${order.id}`,
        { headers, tags: { name: "get_order" } }
    );

    check(getRes, { "get order 200": (r) => r.status === 200 });

    sleep(0.3);

    const ticketsRes = http.get(
        `${CONFIG.baseUrls.ticket}/api/tickets?orderId=${order.id}`,
        { tags: { name: "get_tickets_by_order" } }
    );

    check(ticketsRes, { "get tickets 200": (r) => r.status === 200 });

    sleep(0.5);
}

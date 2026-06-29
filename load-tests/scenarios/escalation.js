import http from "k6/http";
import { check, sleep } from "k6";
import { CONFIG, randomItem, randomInt } from "../config.js";
import { loginRandomUser, authHeaders } from "../helpers/auth.js";

/**
 * Escalation Test: Staged 10x RPS increase until pods break.
 *
 * Stage 1:  1 RPS  — warmup, everything should pass
 * Stage 2: 10 RPS  — light load
 * Stage 3: 100 RPS — moderate pressure
 * Stage 4: 1000 RPS — heavy load, expect pod strain / terminations
 *
 * Traffic mix: 70% reads, 20% order creation, 10% auth-only
 * Uses ramping-arrival-rate so RPS targets are exact regardless of response time.
 * Thresholds are intentionally lenient so the test runs to completion
 * even after the pods start failing.
 */
export const options = {
    scenarios: {
        escalation: {
            executor: "ramping-arrival-rate",
            startRate: 1,
            timeUnit: "1s",
            preAllocatedVUs: 100,
            maxVUs: 800,
            stages: [
                // Stage 1 — 1 RPS warmup
                { duration: "30s", target: 1 },

                // Stage 2 — 10 RPS
                { duration: "10s", target: 10 },
                { duration: "50s", target: 10 },

                // Stage 3 — 100 RPS
                { duration: "10s", target: 100 },
                { duration: "50s", target: 100 },

                // Stage 4 — 1000 RPS
                { duration: "10s", target: 1000 },
                { duration: "50s", target: 1000 },
            ],
        },
    },
    thresholds: {
        // Lenient — we want the test to run through all stages even as pods degrade
        http_req_duration: ["p(95)<30000"],
        http_req_failed: ["rate<0.95"],
    },
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
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" }, timeout: "8s" }
    );

    check(loginRes, { "auth: login 200": (r) => r.status === 200 });

    if (!loginRes.body || loginRes.status !== 200) return;

    const validateRes = http.post(
        `${CONFIG.baseUrls.auth}/auth/validate`,
        JSON.stringify({ token: loginRes.json("token") }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "validate" }, timeout: "8s" }
    );

    check(validateRes, { "auth: validate 200": (r) => r.status === 200 });
}

function createOrder() {
    const { token } = loginRandomUser();
    if (!token) return;

    const headers = authHeaders(token);

    const orderRes = http.post(
        `${CONFIG.baseUrls.order}/api/orders`,
        JSON.stringify({
            customerName: `EscUser-${__VU}`,
            eventName: randomItem(CONFIG.events),
            quantity: randomInt(1, 3),
        }),
        { headers, tags: { name: "create_order" }, timeout: "8s" }
    );

    check(orderRes, { "order: 201 created": (r) => r.status === 201 });
}

function readOrders() {
    const { token } = loginRandomUser();
    if (!token) return;

    const headers = authHeaders(token);

    const listRes = http.get(
        `${CONFIG.baseUrls.order}/api/orders?page=0&size=20`,
        { headers, tags: { name: "list_orders" }, timeout: "8s" }
    );

    check(listRes, { "orders: list 200": (r) => r.status === 200 });

    if (!listRes.body || listRes.status !== 200) return;

    const content = listRes.json("content");
    if (!content || content.length === 0) return;

    const order = randomItem(content);
    const getRes = http.get(
        `${CONFIG.baseUrls.order}/api/orders/${order.id}`,
        { headers, tags: { name: "get_order" }, timeout: "8s" }
    );

    check(getRes, { "orders: get 200": (r) => r.status === 200 });
}

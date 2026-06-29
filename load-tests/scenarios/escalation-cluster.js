import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

// network_errors: TCP/connection failures — status 0, pod is unreachable
// http_errors:    HTTP-level errors — status >= 400, pod is alive but unhappy
const networkErrors = new Counter("network_errors");
const httpErrors = new Counter("http_errors");

/**
 * Escalation Test — in-cluster variant (self-contained, no relative imports).
 *
 * Designed to run as a Kubernetes Job inside the cluster so traffic goes
 * directly over in-cluster DNS, bypassing kubectl port-forward bottlenecks.
 *
 * Stage 1:   1 RPS × 30s  — warmup
 * Stage 2:  10 RPS × 60s  — light load
 * Stage 3: 100 RPS × 60s  — moderate pressure
 * Stage 4: 1000 RPS × 60s — heavy load (pods may terminate)
 *
 * Traffic mix: 70% reads, 20% order creation, 10% auth-only
 */

// ---------------------------------------------------------------------------
// Config (mirrors load-tests/config.js; URLs default to in-cluster services)
// ---------------------------------------------------------------------------
const AUTH_URL = __ENV.AUTH_URL || "http://auth-service:8081";
const ORDER_URL = __ENV.ORDER_URL || "http://order-service:8082";
const TICKET_URL = __ENV.TICKET_URL || "http://ticket-service:8083";

const USERS = [
    { username: "alice", password: "password123" },
    { username: "bob", password: "password456" },
    { username: "charlie", password: "password789" },
];

const EVENTS = [
    "Summer Concert",
    "Tech Conference",
    "Football Match",
    "Comedy Show",
    "Theatre Play",
];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors load-tests/helpers/auth.js)
// ---------------------------------------------------------------------------
function login(user) {
    const res = http.post(
        `${AUTH_URL}/auth/login`,
        JSON.stringify({ username: user.username, password: user.password }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
    );

    check(res, {
        "login status 200": (r) => r.status === 200,
    });

    recordError(res, "login");

    if (!res.body || res.status !== 200) return null;
    return res.json("token");
}

function loginRandomUser() {
    return login(randomItem(USERS));
}

function authHeaders(token) {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}

// Categorises a response into network error, HTTP error, or success.
// Pass an endpoint tag string (e.g. "login") for easier filtering.
function recordError(res, endpoint) {
    if (res.status === 0) {
        networkErrors.add(1, { endpoint });
    } else if (res.status >= 400) {
        httpErrors.add(1, { endpoint, status: String(res.status) });
    }
}

// ---------------------------------------------------------------------------
// k6 options
// ---------------------------------------------------------------------------
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
        // Lenient — run through all stages even as pods degrade
        http_req_duration: ["p(95)<30000"],
        http_req_failed: ["rate<0.95"],
        // Separate counters so the summary clearly shows:
        //   network_errors — TCP failures while pod was down/restarting
        //   http_errors    — HTTP 4xx/5xx while pod was alive
        // No pass/fail threshold set; purely informational in the summary.
        network_errors: [],
        http_errors: [],
    },
};

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------
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
    const user = randomItem(USERS);

    const loginRes = http.post(
        `${AUTH_URL}/auth/login`,
        JSON.stringify({ username: user.username, password: user.password }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
    );

    check(loginRes, { "auth: login 200": (r) => r.status === 200 });
    recordError(loginRes, "login");

    if (!loginRes.body || loginRes.status !== 200) return;

    const validateRes = http.post(
        `${AUTH_URL}/auth/validate`,
        JSON.stringify({ token: loginRes.json("token") }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "validate" } }
    );

    check(validateRes, { "auth: validate 200": (r) => r.status === 200 });
    recordError(validateRes, "validate");
}

function createOrder() {
    const token = loginRandomUser();
    if (!token) return;

    const orderRes = http.post(
        `${ORDER_URL}/api/orders`,
        JSON.stringify({
            customerName: `EscUser-${__VU}`,
            eventName: randomItem(EVENTS),
            quantity: randomInt(1, 3),
        }),
        { headers: authHeaders(token), tags: { name: "create_order" } }
    );

    check(orderRes, { "order: 201 created": (r) => r.status === 201 });
    recordError(orderRes, "create_order");
}

function readOrders() {
    const token = loginRandomUser();
    if (!token) return;

    const listRes = http.get(
        `${ORDER_URL}/api/orders?page=0&size=20`,
        { headers: authHeaders(token), tags: { name: "list_orders" } }
    );

    check(listRes, { "orders: list 200": (r) => r.status === 200 });
    recordError(listRes, "list_orders");

    if (!listRes.body || listRes.status !== 200) return;

    const content = listRes.json("content");
    if (!content || content.length === 0) return;

    const getRes = http.get(
        `${ORDER_URL}/api/orders/${randomItem(content).id}`,
        { headers: authHeaders(token), tags: { name: "get_order" } }
    );

    check(getRes, { "orders: get 200": (r) => r.status === 200 });
    recordError(getRes, "get_order");
}

import http from "k6/http";
import { check, sleep } from "k6";
import { CONFIG, randomItem } from "../config.js";

/**
 * Auth Spike: Burst of login + validate requests.
 *
 * Tests auth-service throughput under sudden traffic spikes.
 * Simulates many concurrent users authenticating at once,
 * e.g. event ticket sale opening.
 */
export const options = {
    scenarios: {
        auth_burst: {
            executor: "ramping-arrival-rate",
            startRate: 5,
            timeUnit: "1s",
            preAllocatedVUs: 50,
            maxVUs: 200,
            stages: [
                { duration: "15s", target: 20 },
                { duration: "30s", target: 50 },
                { duration: "15s", target: 100 },
                { duration: "30s", target: 100 },
                { duration: "15s", target: 0 },
            ],
        },
    },
    thresholds: {
        ...CONFIG.thresholds,
        "http_req_duration{name:login}": ["p(95)<500"],
        "http_req_duration{name:validate}": ["p(95)<200"],
    },
};

export default function () {
    const user = randomItem(CONFIG.users);

    // Login
    const loginRes = http.post(
        `${CONFIG.baseUrls.auth}/auth/login`,
        JSON.stringify({ username: user.username, password: user.password }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
    );

    const loginOk = check(loginRes, {
        "login status 200": (r) => r.status === 200,
        "login returns token": (r) => r.json("token") !== undefined,
    });

    if (!loginOk) return;

    const token = loginRes.json("token");

    // Validate the token
    const validateRes = http.post(
        `${CONFIG.baseUrls.auth}/auth/validate`,
        JSON.stringify({ token: token }),
        {
            headers: { "Content-Type": "application/json" },
            tags: { name: "validate" },
        }
    );

    check(validateRes, {
        "validate status 200": (r) => r.status === 200,
        "token is valid": (r) => r.json("valid") === true,
        "username matches": (r) => r.json("username") === user.username,
    });
}

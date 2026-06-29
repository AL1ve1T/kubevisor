export const CONFIG = {
    baseUrls: {
        auth: __ENV.AUTH_URL || "http://localhost:8081",
        order: __ENV.ORDER_URL || "http://localhost:8082",
        ticket: __ENV.TICKET_URL || "http://localhost:8083",
    },
    users: [
        { username: "alice", password: "password123" },
        { username: "bob", password: "password456" },
        { username: "charlie", password: "password789" },
    ],
    events: [
        "Summer Concert",
        "Tech Conference",
        "Football Match",
        "Comedy Show",
        "Theatre Play",
    ],
    thresholds: {
        http_req_duration: ["p(95)<2000", "p(99)<5000"],
        http_req_failed: ["rate<0.05"],
    },
};

export function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

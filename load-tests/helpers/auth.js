import http from "k6/http";
import { check } from "k6";
import { CONFIG, randomItem } from "../config.js";

export function login(user) {
    const res = http.post(
        `${CONFIG.baseUrls.auth}/auth/login`,
        JSON.stringify({
            username: user.username,
            password: user.password,
        }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
    );

    check(res, {
        "login status 200": (r) => r.status === 200,
        "login returns token": (r) => r.json("token") !== undefined,
    });

    return res.json("token");
}

export function loginRandomUser() {
    const user = randomItem(CONFIG.users);
    return { token: login(user), user };
}

export function authHeaders(token) {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}

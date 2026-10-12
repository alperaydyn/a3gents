"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
const client_js_1 = require("../../db/client.js");
const redis_js_1 = require("../../db/redis.js");
const response_js_1 = require("../../utils/response.js");
async function healthRoutes(app) {
    app.get("/health", async (request, reply) => {
        const checks = { postgres: false, redis: false };
        try {
            await (0, client_js_1.query)("SELECT 1");
            checks.postgres = true;
        }
        catch (err) {
            request.log.error({ err }, "PostgreSQL health check başarısız");
        }
        try {
            checks.redis = (await (0, redis_js_1.getRedis)().ping()) === "PONG";
        }
        catch (err) {
            request.log.error({ err }, "Redis health check başarısız");
        }
        const healthy = checks.postgres && checks.redis;
        if (!healthy) {
            return reply.status(503).send((0, response_js_1.fail)("SERVICE_UNAVAILABLE", "Bağımlılık kontrolü başarısız", checks));
        }
        return reply.send((0, response_js_1.ok)({ status: "ok", checks }));
    });
}

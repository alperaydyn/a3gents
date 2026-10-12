import type { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { getRedis } from "../../db/redis.js";
import { ok, fail } from "../../utils/response.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (request, reply) => {
    const checks = { postgres: false, redis: false };

    try {
      await query("SELECT 1");
      checks.postgres = true;
    } catch (err) {
      request.log.error({ err }, "PostgreSQL health check başarısız");
    }

    try {
      checks.redis = (await getRedis().ping()) === "PONG";
    } catch (err) {
      request.log.error({ err }, "Redis health check başarısız");
    }

    const healthy = checks.postgres && checks.redis;
    if (!healthy) {
      return reply.status(503).send(fail("SERVICE_UNAVAILABLE", "Bağımlılık kontrolü başarısız", checks));
    }
    return reply.send(ok({ status: "ok", checks }));
  });
}

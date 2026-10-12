import type { FastifyPluginAsync } from "fastify";
import { ok, fail } from "../../utils/response.js";
import { getAnalyticsSummary } from "./service.js";

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/analitik/ozet
  app.get("/analitik/ozet", async (_request, reply) => {
    try {
      const data = await getAnalyticsSummary();
      return reply.send(ok(data));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });
};

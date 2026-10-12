import type { FastifyPluginAsync } from "fastify";
import { ok, fail } from "../../utils/response.js";
import {
  listCommunitySessions,
  toggleLike,
  forkSession,
  getCommunityConcepts,
} from "./service.js";
import { ForkSessionSchema } from "./dto.js";

export const communityRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/topluluk/oturumlari
  app.get("/topluluk/oturumlari", async (request, reply) => {
    try {
      const query = request.query as {
        kavram?: string;
        sort?: "popular" | "latest" | "forks";
        limit?: string;
        offset?: string;
      };

      let userId: string | null = null;
      try {
        await request.jwtVerify();
        userId = request.user?.sub || null;
      } catch {
        // Ziyaretçi kullanıcılar da topluluk çalışmalarını görüntüleyebilir
      }

      const sessions = await listCommunitySessions(userId, {
        kavram: query.kavram,
        sort: query.sort,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });

      return reply.send(ok(sessions, { count: sessions.length }));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // POST /api/v1/topluluk/oturumlari/:id/begen
  app.post("/topluluk/oturumlari/:id/begen", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = request.user.sub;

      const result = await toggleLike(userId, id);
      return reply.send(ok(result));
    } catch (err: any) {
      if (err.message?.startsWith("NOT_FOUND")) {
        return reply.status(404).send(fail("NOT_FOUND", err.message));
      }
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // POST /api/v1/topluluk/oturumlari/:id/catalla
  app.post("/topluluk/oturumlari/:id/catalla", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = request.user.sub;

      const body = ForkSessionSchema.parse(request.body || {});
      const newSession = await forkSession(userId, id, body);
      return reply.status(201).send(ok(newSession));
    } catch (err: any) {
      if (err.name === "ZodError") {
        return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz veri", err.errors));
      }
      if (err.message?.startsWith("NOT_FOUND")) {
        return reply.status(404).send(fail("NOT_FOUND", err.message));
      }
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // GET /api/v1/topluluk/kavramlar
  app.get("/topluluk/kavramlar", async (_request, reply) => {
    try {
      const concepts = await getCommunityConcepts();
      return reply.send(ok(concepts));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });
};

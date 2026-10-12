import type { FastifyPluginAsync } from "fastify";
import { SyncService } from "./service.js";
import { SyncPushSchema, SyncPullSchema } from "./dto.js";

/**
 * Senkronizasyon uçları (PBI-9.1 — IDOR kapatma).
 * Tüm uçlar zorunlu JWT doğrulaması arkasındadır. Kullanıcı kimliği YALNIZCA
 * doğrulanmış token'ın `sub` alanından alınır; body/query içindeki `user_id`
 * alanları geriye dönük uyumluluk için şemada kabul edilir ancak yok sayılır.
 */
export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  const syncService = new SyncService();
  const authOnly = { preHandler: fastify.authenticate };

  const unauthenticated = {
    success: false,
    error: { code: "UNAUTHENTICATED", message: "Senkronizasyon için kimlik doğrulama gereklidir." },
  } as const;

  fastify.post("/api/v1/sync/push", authOnly, async (request, reply) => {
    const parseResult = SyncPushSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Geçersiz senkronizasyon verisi",
          details: parseResult.error.format()
        }
      });
    }

    const data = parseResult.data;
    data.user_id = request.user.sub;

    const result = await syncService.pushSyncData(data);
    if (result.error === 'UNAUTHENTICATED') {
      return reply.code(401).send(unauthenticated);
    }
    return reply.send({
      success: true,
      data: result
    });
  });

  fastify.post("/api/v1/sync/pull", authOnly, async (request, reply) => {
    const parseResult = SyncPullSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Geçersiz senkronizasyon sorgusu",
          details: parseResult.error.format()
        }
      });
    }

    const data = parseResult.data;
    data.user_id = request.user.sub;

    const result = await syncService.pullSyncData(data);
    if (!result) {
      return reply.code(401).send(unauthenticated);
    }
    return reply.send({
      success: true,
      data: result.data,
      meta: {
        synced_at: result.synced_at,
        user_id: result.user_id
      }
    });
  });

  fastify.get("/api/v1/sync/status", authOnly, async (request, reply) => {
    const status = await syncService.getSyncStatus(request.user.sub);
    if (!status) {
      return reply.code(401).send(unauthenticated);
    }
    return reply.send({
      success: true,
      data: status
    });
  });

  const timelineHandler = async (request: any, reply: any) => {
    const timeline = await syncService.getReadingTimeline(request.user.sub);
    if (!timeline) {
      return reply.code(401).send(unauthenticated);
    }
    return reply.send({
      success: true,
      data: timeline
    });
  };

  fastify.get("/api/v1/sync/timeline", authOnly, timelineHandler);
  fastify.get("/api/v1/sync/reading-history", authOnly, timelineHandler);
};

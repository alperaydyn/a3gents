import type { FastifyInstance } from "fastify";
import { createSessionSchema, evaluateSessionSchema } from "./dto.js";
import {
  getUserSessions,
  getDueSessions,
  createSession,
  evaluateSession,
} from "./service.js";
import { ok, fail } from "../../utils/response.js";

export async function memorizationRoutes(app: FastifyInstance) {
  // Kullanıcının tüm ezber oturumlarını listele
  app.get("/ezber-oturumlari", { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.user.sub;
    const [sessions, dueSessions] = await Promise.all([
      getUserSessions(userId),
      getDueSessions(userId),
    ]);

    return reply.send(
      ok(sessions, {
        toplamOturum: sessions.length,
        bugunTekrarBekleyen: dueSessions.length,
      }),
    );
  });

  // Yalnızca bugün tekrar bekleyen oturumlar
  app.get("/ezber-oturumlari/bekleyenler", { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.user.sub;
    const due = await getDueSessions(userId);
    return reply.send(ok(due, { count: due.length }));
  });

  // Yeni ezber oturumu başlat
  app.post("/ezber-oturumlari", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(fail("VALIDATION_ERROR", "Geçersiz oturum parametreleri", parsed.error.flatten()));
    }

    const session = await createSession(request.user.sub, parsed.data);
    return reply.status(201).send(ok(session));
  });

  // SM-2 değerlendirmesi (0-5 quality skoru)
  app.post("/ezber-oturumlari/:id/degerlendir", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = evaluateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(fail("VALIDATION_ERROR", "quality skoru 0 ile 5 arasında olmalıdır", parsed.error.flatten()));
    }

    const updated = await evaluateSession(request.user.sub, id, parsed.data.quality);
    if (!updated) {
      return reply.status(404).send(fail("NOT_FOUND", "Ezber oturumu bulunamadı"));
    }

    return reply.send(ok(updated));
  });
}

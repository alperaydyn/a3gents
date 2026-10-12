import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { ok, fail } from "../../utils/response.js";
import { query } from "../../db/client.js";
import { DiagnosticReportSchema, DiagnosticStatusSchema } from "./dto.js";
import { DiagnosticsService } from "./service.js";

/**
 * İstemci Tanılama uçları (PBI-10.3) — prefix: /api/v1/diagnostics
 *
 *  POST  /reports                 → rapor kaydet (isteğe bağlı JWT; misafir / süresi dolmuş oturum da gönderebilir)
 *  GET   /reports                 → kullanıcının kendi raporları (JWT zorunlu)
 *  GET   /admin/reports           → son raporlar (yönetici)
 *  GET   /admin/reports/:code     → tam rapor + olay akışı + katman özeti (yönetici)
 *  PATCH /admin/reports/:code     → durum güncelle: yeni | inceleniyor | cozuldu (yönetici)
 */

/**
 * JWT varsa ve geçerliyse kullanıcıyı çözer; aksi halde anonim (null).
 * Süresi dolmuş oturumla rapor gönderebilmek bilinçli bir tercihtir — 401 sorunlarını
 * tam da bu raporlarla teşhis ediyoruz.
 */
async function resolveOptionalUser(request: FastifyRequest): Promise<string | null> {
  if (!request.headers.authorization) return null;
  try {
    await request.jwtVerify();
    const sub = request.user?.sub;
    if (!sub) return null;
    const res = await query<{ id: string }>("SELECT id FROM kullanicilar WHERE id = $1", [sub]);
    return res.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export const diagnosticsRoutes: FastifyPluginAsync = async (app) => {
  const service = new DiagnosticsService();

  app.post(
    "/reports",
    {
      bodyLimit: 1_048_576, // 1 MB — 600 olaylık rapor ~150 KB
      config: { rateLimit: { max: 6, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const parsed = DiagnosticReportSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz tanılama raporu", parsed.error.flatten()));
      }

      const userId = await resolveOptionalUser(request);
      const result = await service.createReport(parsed.data, userId);
      request.log.info({ code: result.code, events: result.events, userId }, "İstemci tanılama raporu alındı");
      return reply.status(201).send(ok({ id: result.id, code: result.code, events: result.events }));
    }
  );

  app.get("/reports", { preHandler: app.authenticate }, async (request, reply) => {
    const rows = await service.listUserReports(request.user.sub);
    return reply.send(ok(rows, { total: rows.length }));
  });

  app.get("/admin/reports", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const limit = Number((request.query as any)?.limit ?? 50) || 50;
    const rows = await service.listRecentReports(limit);
    return reply.send(ok(rows, { total: rows.length }));
  });

  app.get("/admin/reports/:code", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const data = await service.getReportByCode(code);
    if (!data) return reply.status(404).send(fail("NOT_FOUND", "Rapor bulunamadı"));
    return reply.send(ok(data));
  });

  app.patch("/admin/reports/:code", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const parsed = DiagnosticStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz durum", parsed.error.flatten()));
    }
    const updated = await service.updateStatus(code, parsed.data.durum);
    if (!updated) return reply.status(404).send(fail("NOT_FOUND", "Rapor bulunamadı"));
    return reply.send(ok(updated));
  });
};

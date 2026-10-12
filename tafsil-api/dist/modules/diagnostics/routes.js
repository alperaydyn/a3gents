"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosticsRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const client_js_1 = require("../../db/client.js");
const dto_js_1 = require("./dto.js");
const service_js_1 = require("./service.js");
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
async function resolveOptionalUser(request) {
    if (!request.headers.authorization)
        return null;
    try {
        await request.jwtVerify();
        const sub = request.user?.sub;
        if (!sub)
            return null;
        const res = await (0, client_js_1.query)("SELECT id FROM kullanicilar WHERE id = $1", [sub]);
        return res.rows[0]?.id ?? null;
    }
    catch {
        return null;
    }
}
const diagnosticsRoutes = async (app) => {
    const service = new service_js_1.DiagnosticsService();
    app.post("/reports", {
        bodyLimit: 1_048_576, // 1 MB — 600 olaylık rapor ~150 KB
        config: { rateLimit: { max: 6, timeWindow: "10 minutes" } },
    }, async (request, reply) => {
        const parsed = dto_js_1.DiagnosticReportSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz tanılama raporu", parsed.error.flatten()));
        }
        const userId = await resolveOptionalUser(request);
        const result = await service.createReport(parsed.data, userId);
        request.log.info({ code: result.code, events: result.events, userId }, "İstemci tanılama raporu alındı");
        return reply.status(201).send((0, response_js_1.ok)({ id: result.id, code: result.code, events: result.events }));
    });
    app.get("/reports", { preHandler: app.authenticate }, async (request, reply) => {
        const rows = await service.listUserReports(request.user.sub);
        return reply.send((0, response_js_1.ok)(rows, { total: rows.length }));
    });
    app.get("/admin/reports", { preHandler: app.authorizeAdmin }, async (request, reply) => {
        const limit = Number(request.query?.limit ?? 50) || 50;
        const rows = await service.listRecentReports(limit);
        return reply.send((0, response_js_1.ok)(rows, { total: rows.length }));
    });
    app.get("/admin/reports/:code", { preHandler: app.authorizeAdmin }, async (request, reply) => {
        const { code } = request.params;
        const data = await service.getReportByCode(code);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Rapor bulunamadı"));
        return reply.send((0, response_js_1.ok)(data));
    });
    app.patch("/admin/reports/:code", { preHandler: app.authorizeAdmin }, async (request, reply) => {
        const { code } = request.params;
        const parsed = dto_js_1.DiagnosticStatusSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz durum", parsed.error.flatten()));
        }
        const updated = await service.updateStatus(code, parsed.data.durum);
        if (!updated)
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Rapor bulunamadı"));
        return reply.send((0, response_js_1.ok)(updated));
    });
};
exports.diagnosticsRoutes = diagnosticsRoutes;

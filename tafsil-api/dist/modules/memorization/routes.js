"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memorizationRoutes = memorizationRoutes;
const dto_js_1 = require("./dto.js");
const service_js_1 = require("./service.js");
const response_js_1 = require("../../utils/response.js");
async function memorizationRoutes(app) {
    // Kullanıcının tüm ezber oturumlarını listele
    app.get("/ezber-oturumlari", { preHandler: app.authenticate }, async (request, reply) => {
        const userId = request.user.sub;
        const [sessions, dueSessions] = await Promise.all([
            (0, service_js_1.getUserSessions)(userId),
            (0, service_js_1.getDueSessions)(userId),
        ]);
        return reply.send((0, response_js_1.ok)(sessions, {
            toplamOturum: sessions.length,
            bugunTekrarBekleyen: dueSessions.length,
        }));
    });
    // Yalnızca bugün tekrar bekleyen oturumlar
    app.get("/ezber-oturumlari/bekleyenler", { preHandler: app.authenticate }, async (request, reply) => {
        const userId = request.user.sub;
        const due = await (0, service_js_1.getDueSessions)(userId);
        return reply.send((0, response_js_1.ok)(due, { count: due.length }));
    });
    // Yeni ezber oturumu başlat
    app.post("/ezber-oturumlari", { preHandler: app.authenticate }, async (request, reply) => {
        const parsed = dto_js_1.createSessionSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .status(400)
                .send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz oturum parametreleri", parsed.error.flatten()));
        }
        const session = await (0, service_js_1.createSession)(request.user.sub, parsed.data);
        return reply.status(201).send((0, response_js_1.ok)(session));
    });
    // SM-2 değerlendirmesi (0-5 quality skoru)
    app.post("/ezber-oturumlari/:id/degerlendir", { preHandler: app.authenticate }, async (request, reply) => {
        const { id } = request.params;
        const parsed = dto_js_1.evaluateSessionSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .status(400)
                .send((0, response_js_1.fail)("VALIDATION_ERROR", "quality skoru 0 ile 5 arasında olmalıdır", parsed.error.flatten()));
        }
        const updated = await (0, service_js_1.evaluateSession)(request.user.sub, id, parsed.data.quality);
        if (!updated) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Ezber oturumu bulunamadı"));
        }
        return reply.send((0, response_js_1.ok)(updated));
    });
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.understandingRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const dto_js_1 = require("./dto.js");
const service_js_1 = require("./service.js");
const understandingRoutes = async (app) => {
    // GET /api/v1/anlama-oturumlari - Kullanıcının kendi ve öne çıkarılan oturumları
    app.get("/anlama-oturumlari", { preHandler: [app.authenticate] }, async (request, reply) => {
        const userId = request.user.sub;
        const data = await (0, service_js_1.listSessions)(userId);
        return reply.send((0, response_js_1.ok)(data));
    });
    // GET /api/v1/anlama-oturumlari/:id - Oturum detayı
    app.get("/anlama-oturumlari/:id", async (request, reply) => {
        let userId = "anonymous";
        try {
            await request.jwtVerify();
            userId = request.user?.sub || "anonymous";
        }
        catch {
            // Ziyaretçi genel/öne çıkan oturumları inceleyebilir
        }
        const data = await (0, service_js_1.getSessionDetail)(userId, request.params.id);
        if (!data) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Anlama oturumu bulunamadı"));
        }
        return reply.send((0, response_js_1.ok)(data));
    });
    // POST /api/v1/anlama-oturumlari - Yeni anlama oturumu başlatma
    app.post("/anlama-oturumlari", { preHandler: [app.authenticate] }, async (request, reply) => {
        const parseRes = dto_js_1.createSessionSchema.safeParse(request.body);
        if (!parseRes.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz oturum girdisi"));
        }
        const userId = request.user.sub;
        const data = await (0, service_js_1.createSession)(userId, parseRes.data);
        return reply.status(201).send((0, response_js_1.ok)(data));
    });
    // POST /api/v1/anlama-oturumlari/ara - Semantik ve anahtar kelime arama
    app.post("/anlama-oturumlari/ara", async (request, reply) => {
        const body = request.body;
        const queryText = body?.q || "";
        const limit = body?.limit || 10;
        if (!queryText.trim()) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Arama ifadesi boş olamaz"));
        }
        const results = await import("./service.js").then(m => m.searchSemanticVerses(queryText, limit));
        return reply.send((0, response_js_1.ok)(results, { total: results.length }));
    });
    // GET /api/v1/anlama-oturumlari/:id/stream - Server-Sent Events (SSE) Canlı Ajanik Akış
    app.get("/anlama-oturumlari/:id/stream", { preHandler: [app.authenticate] }, async (request, reply) => {
        const userId = request.user.sub;
        const session = await (0, service_js_1.getSessionDetail)(userId, request.params.id);
        if (!session) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Anlama oturumu bulunamadı"));
        }
        reply.raw.setHeader("Content-Type", "text/event-stream");
        reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.flushHeaders?.();
        const sendEvent = (event, data) => {
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        // Step 1: Niyet ve Kavram Analizi
        sendEvent("step_progress", {
            step: 1,
            title: "Kavramlar ayrıştırılıyor",
            status: "in_progress",
            concepts: session.odak_kavramlar,
        });
        // Step 2: Ayet Taraması
        sendEvent("step_progress", {
            step: 2,
            title: "İlgili ayetler taranıyor",
            status: "in_progress",
            verses_count: session.okuma_kuyrugu.length,
        });
        // Step 3: Sentez Akışı
        sendEvent("step_progress", {
            step: 3,
            title: "Özet ve okuma rotası hazırlandı",
            status: "completed",
            summary_preview: session.sentez_ozeti.slice(0, 80) + "...",
        });
        // Tamamlanma Olayı
        sendEvent("complete", {
            session_id: session.id,
            title: session.baslik,
            sentez_ozeti: session.sentez_ozeti,
            reading_queue: session.okuma_kuyrugu,
        });
        reply.raw.end();
    });
    // POST /api/v1/anlama-oturumlari/:id/soru
    app.post("/anlama-oturumlari/:id/soru", { preHandler: [app.authenticate] }, async (request, reply) => {
        const parseRes = dto_js_1.askQuestionSchema.safeParse(request.body);
        if (!parseRes.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz soru"));
        }
        const userId = request.user.sub;
        const data = await (0, service_js_1.askQuestion)(userId, request.params.id, parseRes.data);
        if (!data) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", "Anlama oturumu bulunamadı"));
        }
        return reply.send((0, response_js_1.ok)(data));
    });
};
exports.understandingRoutes = understandingRoutes;

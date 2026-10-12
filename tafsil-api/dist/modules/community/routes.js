"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const dto_js_1 = require("./dto.js");
const communityRoutes = async (app) => {
    // GET /api/v1/topluluk/oturumlari
    app.get("/topluluk/oturumlari", async (request, reply) => {
        try {
            const query = request.query;
            let userId = null;
            try {
                await request.jwtVerify();
                userId = request.user?.sub || null;
            }
            catch {
                // Ziyaretçi kullanıcılar da topluluk çalışmalarını görüntüleyebilir
            }
            const sessions = await (0, service_js_1.listCommunitySessions)(userId, {
                kavram: query.kavram,
                sort: query.sort,
                limit: query.limit ? parseInt(query.limit, 10) : 20,
                offset: query.offset ? parseInt(query.offset, 10) : 0,
            });
            return reply.send((0, response_js_1.ok)(sessions, { count: sessions.length }));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // POST /api/v1/topluluk/oturumlari/:id/begen
    app.post("/topluluk/oturumlari/:id/begen", { preHandler: [app.authenticate] }, async (request, reply) => {
        try {
            const { id } = request.params;
            const userId = request.user.sub;
            const result = await (0, service_js_1.toggleLike)(userId, id);
            return reply.send((0, response_js_1.ok)(result));
        }
        catch (err) {
            if (err.message?.startsWith("NOT_FOUND")) {
                return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", err.message));
            }
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // POST /api/v1/topluluk/oturumlari/:id/catalla
    app.post("/topluluk/oturumlari/:id/catalla", { preHandler: [app.authenticate] }, async (request, reply) => {
        try {
            const { id } = request.params;
            const userId = request.user.sub;
            const body = dto_js_1.ForkSessionSchema.parse(request.body || {});
            const newSession = await (0, service_js_1.forkSession)(userId, id, body);
            return reply.status(201).send((0, response_js_1.ok)(newSession));
        }
        catch (err) {
            if (err.name === "ZodError") {
                return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz veri", err.errors));
            }
            if (err.message?.startsWith("NOT_FOUND")) {
                return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", err.message));
            }
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // GET /api/v1/topluluk/kavramlar
    app.get("/topluluk/kavramlar", async (_request, reply) => {
        try {
            const concepts = await (0, service_js_1.getCommunityConcepts)();
            return reply.send((0, response_js_1.ok)(concepts));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
};
exports.communityRoutes = communityRoutes;

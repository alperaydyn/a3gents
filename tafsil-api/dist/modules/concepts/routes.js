"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conceptRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const dto_js_1 = require("./dto.js");
const service_js_1 = require("./service.js");
const conceptRoutes = async (app) => {
    // GET /api/v1/kavramlar
    app.get("/kavramlar", async (request, reply) => {
        const parseRes = dto_js_1.listConceptsQuerySchema.safeParse(request.query);
        if (!parseRes.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sorgu parametreleri"));
        }
        const { data, cached } = await (0, service_js_1.listConcepts)(parseRes.data);
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // GET /api/v1/kavramlar/:slug
    app.get("/kavramlar/:slug", async (request, reply) => {
        const { slug } = request.params;
        const { data, cached } = await (0, service_js_1.getConceptBySlug)(slug);
        if (!data) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
        }
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // GET /api/v1/kavramlar/:slug/dag
    app.get("/kavramlar/:slug/dag", async (request, reply) => {
        const { slug } = request.params;
        const depth = request.query.depth ? Math.min(parseInt(request.query.depth, 10) || 2, 4) : 2;
        const limit = request.query.limit ? Math.min(parseInt(request.query.limit, 10) || 15, 30) : 15;
        const { data, cached } = await (0, service_js_1.getConceptDag)(slug, depth, limit);
        if (!data) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
        }
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // GET /api/v1/kavramlar/:slug/nuzul-analizi
    app.get("/kavramlar/:slug/nuzul-analizi", async (request, reply) => {
        const { slug } = request.params;
        const { data, cached } = await (0, service_js_1.getConceptNuzulAnalysis)(slug);
        if (!data) {
            return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
        }
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
};
exports.conceptRoutes = conceptRoutes;

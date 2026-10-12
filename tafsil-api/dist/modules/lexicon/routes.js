"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lexiconRoutes = lexiconRoutes;
const zod_1 = require("zod");
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const idParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().min(1) });
const searchKoklerQuery = zod_1.z.object({
    q: zod_1.z.string().min(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
async function lexiconRoutes(app) {
    // Kök Arama
    app.get("/kokler", async (request, reply) => {
        const parsed = searchKoklerQuery.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz arama parametresi", parsed.error.flatten()));
        }
        const data = await (0, service_js_1.searchKokler)(parsed.data.q, parsed.data.limit);
        return reply.send((0, response_js_1.ok)(data, { total: data.length }));
    });
    // BE-018
    app.get("/kelimeler/:id", async (request, reply) => {
        const parsed = idParam.safeParse(request.params);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz kelime id", parsed.error.flatten()));
        }
        const { data, cached } = await (0, service_js_1.getKelime)(parsed.data.id);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("KELIME_NOT_FOUND", "Kelime bulunamadı"));
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // BE-019
    app.get("/kokler/:id/turevler", async (request, reply) => {
        const parsed = idParam.safeParse(request.params);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz kök id", parsed.error.flatten()));
        }
        const { data, cached } = await (0, service_js_1.getKokTurevleri)(parsed.data.id);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("KOK_NOT_FOUND", "Kök bulunamadı"));
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
}

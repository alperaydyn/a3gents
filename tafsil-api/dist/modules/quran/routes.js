"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quranRoutes = quranRoutes;
const zod_1 = require("zod");
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const sureIdParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().min(1).max(114) });
const ayetIdParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().min(1) });
const ayetParams = zod_1.z.object({
    sureId: zod_1.z.coerce.number().int().min(1).max(114),
    ayetNo: zod_1.z.coerce.number().int().min(1),
});
const listAyetlerQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(300).default(50),
    lang: zod_1.z.enum(["tr", "en"]).default("tr"),
});
const ayetQuery = zod_1.z.object({
    lang: zod_1.z.enum(["tr", "en"]).default("tr"),
});
const surelerQuery = zod_1.z.object({
    siralama: zod_1.z.enum(["mushaf", "nuzul"]).default("mushaf"),
});
async function quranRoutes(app) {
    // BE-004
    app.get("/sureler", async (request, reply) => {
        const parsed = surelerQuery.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sorgu parametresi", parsed.error.flatten()));
        }
        const { data, cached } = await (0, service_js_1.listSureler)(parsed.data.siralama);
        return reply.send((0, response_js_1.ok)(data, { total: data.length, cached }));
    });
    // BE-005
    app.get("/sureler/:id/detay", async (request, reply) => {
        const parsed = sureIdParam.safeParse(request.params);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sure id", parsed.error.flatten()));
        }
        const { data, cached } = await (0, service_js_1.getSureDetay)(parsed.data.id);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("SURE_NOT_FOUND", "Sure bulunamadı"));
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // BE-007
    app.get("/sureler/:id/ayetler", async (request, reply) => {
        const parsedParams = sureIdParam.safeParse(request.params);
        if (!parsedParams.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sure id", parsedParams.error.flatten()));
        }
        const parsedQuery = listAyetlerQuery.safeParse(request.query);
        if (!parsedQuery.success) {
            return reply
                .status(400)
                .send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sorgu parametresi", parsedQuery.error.flatten()));
        }
        const { page, limit, lang } = parsedQuery.data;
        const { rows, total } = await (0, service_js_1.listAyetler)(parsedParams.data.id, page, limit, lang);
        return reply.send((0, response_js_1.ok)(rows, { page, limit, total }));
    });
    // BE-006
    app.get("/ayetler/:sureId/:ayetNo", async (request, reply) => {
        const parsed = ayetParams.safeParse(request.params);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz sure veya ayet no", parsed.error.flatten()));
        }
        const parsedQuery = ayetQuery.safeParse(request.query);
        const lang = parsedQuery.success ? parsedQuery.data.lang : "tr";
        const { sureId, ayetNo } = parsed.data;
        const { data, cached } = await (0, service_js_1.getAyet)(sureId, ayetNo, lang);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("AYET_NOT_FOUND", "Ayet bulunamadı"));
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
    // BE-017
    app.get("/ayetler/:id/audio", async (request, reply) => {
        const parsed = ayetIdParam.safeParse(request.params);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz ayet id", parsed.error.flatten()));
        }
        const { data, cached } = await (0, service_js_1.getAyetAudio)(parsed.data.id);
        if (!data)
            return reply.status(404).send((0, response_js_1.fail)("AYET_NOT_FOUND", "Ayet bulunamadı"));
        return reply.send((0, response_js_1.ok)(data, { cached }));
    });
}

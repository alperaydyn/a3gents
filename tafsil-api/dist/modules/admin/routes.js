"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const zod_1 = require("zod");
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const moderateSchema = zod_1.z.object({
    is_featured: zod_1.z.boolean().optional(),
    moderation_status: zod_1.z.enum(["onaylandi", "beklemede", "reddedildi"]).optional(),
});
const createArticleSchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    slug: zod_1.z.string().min(2),
    author: zod_1.z.string().min(2),
    summary: zod_1.z.string().min(10),
    content_md: zod_1.z.string().min(20),
    primary_concepts: zod_1.z.array(zod_1.z.string()).optional(),
    related_surahs: zod_1.z.array(zod_1.z.number().int()).optional(),
    reading_time_minutes: zod_1.z.number().int().positive().optional(),
});
const updateArticleSchema = zod_1.z.object({
    title: zod_1.z.string().optional(),
    summary: zod_1.z.string().optional(),
    content_md: zod_1.z.string().optional(),
    primary_concepts: zod_1.z.array(zod_1.z.string()).optional(),
    related_surahs: zod_1.z.array(zod_1.z.number().int()).optional(),
    reading_time_minutes: zod_1.z.number().int().positive().optional(),
    is_verified: zod_1.z.boolean().optional(),
});
const createConceptSchema = zod_1.z.object({
    slug: zod_1.z.string().min(2),
    baslik_tr: zod_1.z.string().min(2),
    baslik_ar: zod_1.z.string().optional(),
    tanim: zod_1.z.string().min(10),
    onaylandi: zod_1.z.boolean().optional(),
});
const createRelationSchema = zod_1.z.object({
    kaynak_kavram_id: zod_1.z.number().int().positive(),
    hedef_kavram_id: zod_1.z.number().int().positive(),
    iliski_tipi: zod_1.z.enum(["es_anlam", "zit_anlam", "kapsama", "sebep_sonuc", "iliskili"]),
    agirlik: zod_1.z.number().positive().optional(),
});
async function adminRoutes(app) {
    // Tüm admin uçları için zorunlu JWT ve role === 'admin' kontrolü
    app.addHook("preHandler", app.authorizeAdmin);
    // 1. Dashboard Metrics
    app.get("/dashboard", async (request, reply) => {
        try {
            const stats = await (0, service_js_1.getAdminDashboardMetrics)();
            return reply.send((0, response_js_1.ok)(stats));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // 2. Community Studies Moderation List
    app.get("/topluluk", async (request, reply) => {
        const queryParams = request.query;
        const status = queryParams?.status;
        const limit = queryParams?.limit ? parseInt(queryParams.limit, 10) : 50;
        const offset = queryParams?.offset ? parseInt(queryParams.offset, 10) : 0;
        try {
            const list = await (0, service_js_1.listCommunityModeration)(status, limit, offset);
            return reply.send((0, response_js_1.ok)(list, { total: list.length }));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // 3. Moderate Community Study (feature / approve / reject)
    app.patch("/topluluk/:id/moderasyon", async (request, reply) => {
        const { id } = request.params;
        const parsed = moderateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz moderasyon verisi", parsed.error.flatten()));
        }
        const adminId = request.user.sub;
        try {
            const result = await (0, service_js_1.moderateCommunitySession)(adminId, id, parsed.data);
            return reply.send((0, response_js_1.ok)(result));
        }
        catch (err) {
            return reply.status(400).send((0, response_js_1.fail)("MODERATION_ERROR", err.message));
        }
    });
    // 4. Create Editorial Article with automated Reference Score
    app.post("/makaleler", async (request, reply) => {
        const parsed = createArticleSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz makale verisi", parsed.error.flatten()));
        }
        const adminId = request.user.sub;
        try {
            const result = await (0, service_js_1.createArticle)(adminId, parsed.data);
            return reply.status(201).send((0, response_js_1.ok)(result));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("CREATE_ARTICLE_ERROR", err.message));
        }
    });
    // 5. Update Editorial Article
    app.patch("/makaleler/:slug", async (request, reply) => {
        const { slug } = request.params;
        const parsed = updateArticleSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz güncelleme verisi", parsed.error.flatten()));
        }
        const adminId = request.user.sub;
        try {
            const result = await (0, service_js_1.updateArticle)(adminId, slug, parsed.data);
            return reply.send((0, response_js_1.ok)(result));
        }
        catch (err) {
            return reply.status(400).send((0, response_js_1.fail)("UPDATE_ARTICLE_ERROR", err.message));
        }
    });
    // 6. Create Concept
    app.post("/kavramlar", async (request, reply) => {
        const parsed = createConceptSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz kavram verisi", parsed.error.flatten()));
        }
        const adminId = request.user.sub;
        try {
            const result = await (0, service_js_1.createConcept)(adminId, parsed.data);
            return reply.status(201).send((0, response_js_1.ok)(result));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("CREATE_CONCEPT_ERROR", err.message));
        }
    });
    // 7. Create Concept Relation (DAG)
    app.post("/kavramlar/iliskiler", async (request, reply) => {
        const parsed = createRelationSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz ilişki verisi", parsed.error.flatten()));
        }
        const adminId = request.user.sub;
        try {
            const result = await (0, service_js_1.createConceptRelation)(adminId, parsed.data);
            return reply.status(201).send((0, response_js_1.ok)(result));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("CREATE_RELATION_ERROR", err.message));
        }
    });
}

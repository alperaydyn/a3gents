"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editorialRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const dto_js_1 = require("./dto.js");
const editorialRoutes = async (app) => {
    // GET /api/v1/makaleler
    app.get("/makaleler", async (_request, reply) => {
        try {
            const articles = await (0, service_js_1.listArticles)();
            return reply.send((0, response_js_1.ok)(articles, { total: articles.length }));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // GET /api/v1/makaleler/:slug
    app.get("/makaleler/:slug", async (request, reply) => {
        try {
            const { slug } = request.params;
            const article = await (0, service_js_1.getArticleBySlug)(slug);
            return reply.send((0, response_js_1.ok)(article));
        }
        catch (err) {
            if (err.message?.startsWith("NOT_FOUND")) {
                return reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", err.message));
            }
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
    // POST /api/v1/makaleler/dogrula
    app.post("/makaleler/dogrula", async (request, reply) => {
        try {
            const body = dto_js_1.VerifyContentSchema.parse(request.body);
            const result = (0, service_js_1.verifyQuranReferences)(body.content_md);
            return reply.send((0, response_js_1.ok)(result));
        }
        catch (err) {
            if (err.name === "ZodError") {
                return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz içerik", err.errors));
            }
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
};
exports.editorialRoutes = editorialRoutes;

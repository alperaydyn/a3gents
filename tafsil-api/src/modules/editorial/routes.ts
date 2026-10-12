import type { FastifyPluginAsync } from "fastify";
import { ok, fail } from "../../utils/response.js";
import { listArticles, getArticleBySlug, verifyQuranReferences } from "./service.js";
import { VerifyContentSchema } from "./dto.js";

export const editorialRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/makaleler
  app.get("/makaleler", async (_request, reply) => {
    try {
      const articles = await listArticles();
      return reply.send(ok(articles, { total: articles.length }));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // GET /api/v1/makaleler/:slug
  app.get("/makaleler/:slug", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const article = await getArticleBySlug(slug);
      return reply.send(ok(article));
    } catch (err: any) {
      if (err.message?.startsWith("NOT_FOUND")) {
        return reply.status(404).send(fail("NOT_FOUND", err.message));
      }
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // POST /api/v1/makaleler/dogrula
  app.post("/makaleler/dogrula", async (request, reply) => {
    try {
      const body = VerifyContentSchema.parse(request.body);
      const result = verifyQuranReferences(body.content_md);
      return reply.send(ok(result));
    } catch (err: any) {
      if (err.name === "ZodError") {
        return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz içerik", err.errors));
      }
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });
};

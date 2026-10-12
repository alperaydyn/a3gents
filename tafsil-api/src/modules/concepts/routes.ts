import type { FastifyPluginAsync } from "fastify";
import { ok, fail } from "../../utils/response.js";
import { listConceptsQuerySchema } from "./dto.js";
import {
  listConcepts,
  getConceptBySlug,
  getConceptDag,
  getConceptNuzulAnalysis,
} from "./service.js";

export const conceptRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/kavramlar
  app.get("/kavramlar", async (request, reply) => {
    const parseRes = listConceptsQuerySchema.safeParse(request.query);
    if (!parseRes.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz sorgu parametreleri"));
    }

    const { data, cached } = await listConcepts(parseRes.data);
    return reply.send(ok(data, { cached }));
  });

  // GET /api/v1/kavramlar/:slug
  app.get<{ Params: { slug: string } }>("/kavramlar/:slug", async (request, reply) => {
    const { slug } = request.params;
    const { data, cached } = await getConceptBySlug(slug);

    if (!data) {
      return reply.status(404).send(fail("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
    }

    return reply.send(ok(data, { cached }));
  });

  // GET /api/v1/kavramlar/:slug/dag
  app.get<{
    Params: { slug: string };
    Querystring: { depth?: string; limit?: string };
  }>("/kavramlar/:slug/dag", async (request, reply) => {
    const { slug } = request.params;
    const depth = request.query.depth ? Math.min(parseInt(request.query.depth, 10) || 2, 4) : 2;
    const limit = request.query.limit ? Math.min(parseInt(request.query.limit, 10) || 15, 30) : 15;

    const { data, cached } = await getConceptDag(slug, depth, limit);
    if (!data) {
      return reply.status(404).send(fail("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
    }

    return reply.send(ok(data, { cached }));
  });

  // GET /api/v1/kavramlar/:slug/nuzul-analizi
  app.get<{ Params: { slug: string } }>("/kavramlar/:slug/nuzul-analizi", async (request, reply) => {
    const { slug } = request.params;
    const { data, cached } = await getConceptNuzulAnalysis(slug);

    if (!data) {
      return reply.status(404).send(fail("NOT_FOUND", `Kavram bulunamadı: ${slug}`));
    }

    return reply.send(ok(data, { cached }));
  });
};

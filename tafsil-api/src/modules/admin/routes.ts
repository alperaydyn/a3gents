import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, fail } from "../../utils/response.js";
import {
  getAdminDashboardMetrics,
  listCommunityModeration,
  moderateCommunitySession,
  createArticle,
  updateArticle,
  createConcept,
  createConceptRelation,
} from "./service.js";

const moderateSchema = z.object({
  is_featured: z.boolean().optional(),
  moderation_status: z.enum(["onaylandi", "beklemede", "reddedildi"]).optional(),
});

const createArticleSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(2),
  author: z.string().min(2),
  summary: z.string().min(10),
  content_md: z.string().min(20),
  primary_concepts: z.array(z.string()).optional(),
  related_surahs: z.array(z.number().int()).optional(),
  reading_time_minutes: z.number().int().positive().optional(),
});

const updateArticleSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  content_md: z.string().optional(),
  primary_concepts: z.array(z.string()).optional(),
  related_surahs: z.array(z.number().int()).optional(),
  reading_time_minutes: z.number().int().positive().optional(),
  is_verified: z.boolean().optional(),
});

const createConceptSchema = z.object({
  slug: z.string().min(2),
  baslik_tr: z.string().min(2),
  baslik_ar: z.string().optional(),
  tanim: z.string().min(10),
  onaylandi: z.boolean().optional(),
});

const createRelationSchema = z.object({
  kaynak_kavram_id: z.number().int().positive(),
  hedef_kavram_id: z.number().int().positive(),
  iliski_tipi: z.enum(["es_anlam", "zit_anlam", "kapsama", "sebep_sonuc", "iliskili"]),
  agirlik: z.number().positive().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  // Tüm admin uçları için zorunlu JWT ve role === 'admin' kontrolü
  app.addHook("preHandler", app.authorizeAdmin);

  // 1. Dashboard Metrics
  app.get("/dashboard", async (request, reply) => {
    try {
      const stats = await getAdminDashboardMetrics();
      return reply.send(ok(stats));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // 2. Community Studies Moderation List
  app.get("/topluluk", async (request, reply) => {
    const queryParams = request.query as any;
    const status = queryParams?.status as string | undefined;
    const limit = queryParams?.limit ? parseInt(queryParams.limit, 10) : 50;
    const offset = queryParams?.offset ? parseInt(queryParams.offset, 10) : 0;

    try {
      const list = await listCommunityModeration(status, limit, offset);
      return reply.send(ok(list, { total: list.length }));
    } catch (err: any) {
      return reply.status(500).send(fail("INTERNAL_ERROR", err.message));
    }
  });

  // 3. Moderate Community Study (feature / approve / reject)
  app.patch("/topluluk/:id/moderasyon", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = moderateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz moderasyon verisi", parsed.error.flatten()));
    }

    const adminId = request.user.sub;

    try {
      const result = await moderateCommunitySession(adminId, id, parsed.data);
      return reply.send(ok(result));
    } catch (err: any) {
      return reply.status(400).send(fail("MODERATION_ERROR", err.message));
    }
  });

  // 4. Create Editorial Article with automated Reference Score
  app.post("/makaleler", async (request, reply) => {
    const parsed = createArticleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz makale verisi", parsed.error.flatten()));
    }

    const adminId = request.user.sub;

    try {
      const result = await createArticle(adminId, parsed.data);
      return reply.status(201).send(ok(result));
    } catch (err: any) {
      return reply.status(500).send(fail("CREATE_ARTICLE_ERROR", err.message));
    }
  });

  // 5. Update Editorial Article
  app.patch("/makaleler/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = updateArticleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz güncelleme verisi", parsed.error.flatten()));
    }

    const adminId = request.user.sub;

    try {
      const result = await updateArticle(adminId, slug, parsed.data);
      return reply.send(ok(result));
    } catch (err: any) {
      return reply.status(400).send(fail("UPDATE_ARTICLE_ERROR", err.message));
    }
  });

  // 6. Create Concept
  app.post("/kavramlar", async (request, reply) => {
    const parsed = createConceptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz kavram verisi", parsed.error.flatten()));
    }

    const adminId = request.user.sub;

    try {
      const result = await createConcept(adminId, parsed.data);
      return reply.status(201).send(ok(result));
    } catch (err: any) {
      return reply.status(500).send(fail("CREATE_CONCEPT_ERROR", err.message));
    }
  });

  // 7. Create Concept Relation (DAG)
  app.post("/kavramlar/iliskiler", async (request, reply) => {
    const parsed = createRelationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz ilişki verisi", parsed.error.flatten()));
    }

    const adminId = request.user.sub;

    try {
      const result = await createConceptRelation(adminId, parsed.data);
      return reply.status(201).send(ok(result));
    } catch (err: any) {
      return reply.status(500).send(fail("CREATE_RELATION_ERROR", err.message));
    }
  });
}

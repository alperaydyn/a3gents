import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, fail } from "../../utils/response.js";
import { listSureler, getSureDetay, getAyet, listAyetler, getAyetAudio } from "./service.js";

const sureIdParam = z.object({ id: z.coerce.number().int().min(1).max(114) });
const ayetIdParam = z.object({ id: z.coerce.number().int().min(1) });
const ayetParams = z.object({
  sureId: z.coerce.number().int().min(1).max(114),
  ayetNo: z.coerce.number().int().min(1),
});
const listAyetlerQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(300).default(50),
  lang: z.enum(["tr", "en"]).default("tr"),
});
const ayetQuery = z.object({
  lang: z.enum(["tr", "en"]).default("tr"),
});
const surelerQuery = z.object({
  siralama: z.enum(["mushaf", "nuzul"]).default("mushaf"),
});

export async function quranRoutes(app: FastifyInstance) {
  // BE-004
  app.get("/sureler", async (request, reply) => {
    const parsed = surelerQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz sorgu parametresi", parsed.error.flatten()));
    }
    const { data, cached } = await listSureler(parsed.data.siralama);
    return reply.send(ok(data, { total: data.length, cached }));
  });

  // BE-005
  app.get("/sureler/:id/detay", async (request, reply) => {
    const parsed = sureIdParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz sure id", parsed.error.flatten()));
    }
    const { data, cached } = await getSureDetay(parsed.data.id);
    if (!data) return reply.status(404).send(fail("SURE_NOT_FOUND", "Sure bulunamadı"));
    return reply.send(ok(data, { cached }));
  });

  // BE-007
  app.get("/sureler/:id/ayetler", async (request, reply) => {
    const parsedParams = sureIdParam.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz sure id", parsedParams.error.flatten()));
    }
    const parsedQuery = listAyetlerQuery.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply
        .status(400)
        .send(fail("VALIDATION_ERROR", "Geçersiz sorgu parametresi", parsedQuery.error.flatten()));
    }

    const { page, limit, lang } = parsedQuery.data;
    const { rows, total } = await listAyetler(parsedParams.data.id, page, limit, lang);
    return reply.send(ok(rows, { page, limit, total }));
  });

  // BE-006
  app.get("/ayetler/:sureId/:ayetNo", async (request, reply) => {
    const parsed = ayetParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz sure veya ayet no", parsed.error.flatten()));
    }
    const parsedQuery = ayetQuery.safeParse(request.query);
    const lang = parsedQuery.success ? parsedQuery.data.lang : "tr";
    const { sureId, ayetNo } = parsed.data;
    const { data, cached } = await getAyet(sureId, ayetNo, lang);
    if (!data) return reply.status(404).send(fail("AYET_NOT_FOUND", "Ayet bulunamadı"));
    return reply.send(ok(data, { cached }));
  });

  // BE-017
  app.get("/ayetler/:id/audio", async (request, reply) => {
    const parsed = ayetIdParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz ayet id", parsed.error.flatten()));
    }
    const { data, cached } = await getAyetAudio(parsed.data.id);
    if (!data) return reply.status(404).send(fail("AYET_NOT_FOUND", "Ayet bulunamadı"));
    return reply.send(ok(data, { cached }));
  });
}

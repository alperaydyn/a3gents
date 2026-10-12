import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, fail } from "../../utils/response.js";
import { getKelime, getKokTurevleri, searchKokler } from "./service.js";

const idParam = z.object({ id: z.coerce.number().int().min(1) });
const searchKoklerQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function lexiconRoutes(app: FastifyInstance) {
  // Kök Arama
  app.get("/kokler", async (request, reply) => {
    const parsed = searchKoklerQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz arama parametresi", parsed.error.flatten()));
    }
    const data = await searchKokler(parsed.data.q, parsed.data.limit);
    return reply.send(ok(data, { total: data.length }));
  });

  // BE-018
  app.get("/kelimeler/:id", async (request, reply) => {
    const parsed = idParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz kelime id", parsed.error.flatten()));
    }
    const { data, cached } = await getKelime(parsed.data.id);
    if (!data) return reply.status(404).send(fail("KELIME_NOT_FOUND", "Kelime bulunamadı"));
    return reply.send(ok(data, { cached }));
  });

  // BE-019
  app.get("/kokler/:id/turevler", async (request, reply) => {
    const parsed = idParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz kök id", parsed.error.flatten()));
    }
    const { data, cached } = await getKokTurevleri(parsed.data.id);
    if (!data) return reply.status(404).send(fail("KOK_NOT_FOUND", "Kök bulunamadı"));
    return reply.send(ok(data, { cached }));
  });
}

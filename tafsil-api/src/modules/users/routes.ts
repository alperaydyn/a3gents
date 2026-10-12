import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUserById, updateUserPrefs } from "./service.js";
import { toPublicUser } from "./dto.js";
import { ok, fail } from "../../utils/response.js";

const patchMeSchema = z.object({
  tercihModu: z.enum(["kesif", "ogrenme", "odak"]).optional(),
  dil: z.string().min(2).max(8).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await getUserById(request.user.sub);
    if (!user) return reply.status(404).send(fail("USER_NOT_FOUND", "Kullanıcı bulunamadı"));
    return reply.send(ok(toPublicUser(user)));
  });

  app.patch("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = patchMeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz istek gövdesi", parsed.error.flatten()));
    }

    const user = await updateUserPrefs(request.user.sub, {
      tercih_modu: parsed.data.tercihModu,
      dil: parsed.data.dil,
    });
    if (!user) return reply.status(404).send(fail("USER_NOT_FOUND", "Kullanıcı bulunamadı"));
    return reply.send(ok(toPublicUser(user)));
  });
}

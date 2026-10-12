import type { FastifyInstance } from "fastify";
import { getDailyCards, getUserDashboardStats } from "./service.js";
import { ok } from "../../utils/response.js";

export async function dashboardRoutes(app: FastifyInstance) {
  // Günün İlham Kartları (Günün Ayeti, Günün Duası, Günün İbadet Ayeti)
  app.get("/dashboard/gunun-kartlari", async (_request, reply) => {
    const cards = await getDailyCards();
    return reply.send(ok(cards));
  });

  // Kullanıcı İlerleme ve Ezber İstatistikleri
  app.get("/dashboard/istatistikler", { preHandler: app.authenticate }, async (request, reply) => {
    const stats = await getUserDashboardStats(request.user.sub);
    return reply.send(ok(stats));
  });
}

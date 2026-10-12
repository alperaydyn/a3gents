"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRoutes = dashboardRoutes;
const service_js_1 = require("./service.js");
const response_js_1 = require("../../utils/response.js");
async function dashboardRoutes(app) {
    // Günün İlham Kartları (Günün Ayeti, Günün Duası, Günün İbadet Ayeti)
    app.get("/dashboard/gunun-kartlari", async (_request, reply) => {
        const cards = await (0, service_js_1.getDailyCards)();
        return reply.send((0, response_js_1.ok)(cards));
    });
    // Kullanıcı İlerleme ve Ezber İstatistikleri
    app.get("/dashboard/istatistikler", { preHandler: app.authenticate }, async (request, reply) => {
        const stats = await (0, service_js_1.getUserDashboardStats)(request.user.sub);
        return reply.send((0, response_js_1.ok)(stats));
    });
}

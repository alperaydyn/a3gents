"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRoutes = void 0;
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const analyticsRoutes = async (app) => {
    // GET /api/v1/analitik/ozet
    app.get("/analitik/ozet", async (_request, reply) => {
        try {
            const data = await (0, service_js_1.getAnalyticsSummary)();
            return reply.send((0, response_js_1.ok)(data));
        }
        catch (err) {
            return reply.status(500).send((0, response_js_1.fail)("INTERNAL_ERROR", err.message));
        }
    });
};
exports.analyticsRoutes = analyticsRoutes;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const sensible_1 = __importDefault(require("@fastify/sensible"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const env_js_1 = require("./config/env.js");
const auth_js_1 = require("./plugins/auth.js");
const response_js_1 = require("./utils/response.js");
const routes_js_1 = require("./modules/health/routes.js");
const routes_js_2 = require("./modules/auth/routes.js");
const routes_js_3 = require("./modules/users/routes.js");
const routes_js_4 = require("./modules/quran/routes.js");
const routes_js_5 = require("./modules/lexicon/routes.js");
const routes_js_6 = require("./modules/memorization/routes.js");
const routes_js_7 = require("./modules/dashboard/routes.js");
const routes_js_8 = require("./modules/concepts/routes.js");
const routes_js_9 = require("./modules/understanding/routes.js");
const routes_js_10 = require("./modules/community/routes.js");
const routes_js_11 = require("./modules/editorial/routes.js");
const routes_js_12 = require("./modules/analytics/routes.js");
const routes_js_13 = require("./modules/admin/routes.js");
const routes_js_14 = require("./modules/sync/routes.js");
const routes_js_15 = require("./modules/audio/routes.js");
const routes_js_16 = require("./modules/subscriptions/routes.js");
const routes_js_17 = require("./modules/diagnostics/routes.js");
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: { level: env_js_1.config.logLevel },
    });
    await app.register(helmet_1.default);
    await app.register(cors_1.default, { origin: env_js_1.config.corsOrigins });
    await app.register(sensible_1.default);
    await app.register(rate_limit_1.default, {
        max: env_js_1.config.rateLimit.general,
        timeWindow: "1 minute",
    });
    await app.register(swagger_1.default, {
        openapi: {
            info: { title: "tafsil.net API", version: "1.0.0" },
        },
    });
    await app.register(swagger_ui_1.default, { routePrefix: "/docs" });
    await app.register(auth_js_1.authPlugin);
    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        const statusCode = error.statusCode ?? 500;
        reply.status(statusCode).send((0, response_js_1.fail)("INTERNAL_ERROR", error.message || "Beklenmeyen bir hata oluştu"));
    });
    app.setNotFoundHandler((request, reply) => {
        reply.status(404).send((0, response_js_1.fail)("NOT_FOUND", `Route bulunamadı: ${request.method} ${request.url}`));
    });
    app.get("/", async () => ({
        name: "tafsil.net API",
        version: "1.0.0",
        status: "online",
        docs: "/docs",
        health: "/health",
    }));
    app.get("/api/v1", async () => ({
        name: "tafsil.net API (v1)",
        version: "1.0.0",
        status: "online",
        endpoints: {
            sureler: "/api/v1/sureler",
            kavramlar: "/api/v1/kavramlar",
            docs: "/docs",
            health: "/health",
        },
    }));
    await app.register(routes_js_1.healthRoutes);
    await app.register(routes_js_2.authRoutes, { prefix: "/api/v1/auth" });
    await app.register(routes_js_3.userRoutes, { prefix: "/api/v1/users" });
    await app.register(routes_js_4.quranRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_5.lexiconRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_6.memorizationRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_7.dashboardRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_8.conceptRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_9.understandingRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_10.communityRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_11.editorialRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_12.analyticsRoutes, { prefix: "/api/v1" });
    await app.register(routes_js_13.adminRoutes, { prefix: "/api/v1/admin" });
    await app.register(routes_js_16.subscriptionRoutes, { prefix: "/api/v1/subscriptions" });
    await app.register(routes_js_17.diagnosticsRoutes, { prefix: "/api/v1/diagnostics" });
    await app.register(routes_js_14.syncRoutes);
    await app.register(routes_js_15.audioRoutes);
    return app;
}

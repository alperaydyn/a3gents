import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { fail } from "./utils/response.js";
import { healthRoutes } from "./modules/health/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { quranRoutes } from "./modules/quran/routes.js";
import { lexiconRoutes } from "./modules/lexicon/routes.js";
import { memorizationRoutes } from "./modules/memorization/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { conceptRoutes } from "./modules/concepts/routes.js";
import { understandingRoutes } from "./modules/understanding/routes.js";
import { communityRoutes } from "./modules/community/routes.js";
import { editorialRoutes } from "./modules/editorial/routes.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { syncRoutes } from "./modules/sync/routes.js";
import { audioRoutes } from "./modules/audio/routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/routes.js";
import { diagnosticsRoutes } from "./modules/diagnostics/routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: config.rateLimit.general,
    timeWindow: "1 minute",
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "tafsil.net API", version: "1.0.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(authPlugin);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send(fail("INTERNAL_ERROR", error.message || "Beklenmeyen bir hata oluştu"));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(fail("NOT_FOUND", `Route bulunamadı: ${request.method} ${request.url}`));
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

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(quranRoutes, { prefix: "/api/v1" });
  await app.register(lexiconRoutes, { prefix: "/api/v1" });
  await app.register(memorizationRoutes, { prefix: "/api/v1" });
  await app.register(dashboardRoutes, { prefix: "/api/v1" });
  await app.register(conceptRoutes, { prefix: "/api/v1" });
  await app.register(understandingRoutes, { prefix: "/api/v1" });
  await app.register(communityRoutes, { prefix: "/api/v1" });
  await app.register(editorialRoutes, { prefix: "/api/v1" });
  await app.register(analyticsRoutes, { prefix: "/api/v1" });
  await app.register(adminRoutes, { prefix: "/api/v1/admin" });
  await app.register(subscriptionRoutes, { prefix: "/api/v1/subscriptions" });
  await app.register(diagnosticsRoutes, { prefix: "/api/v1/diagnostics" });
  await app.register(syncRoutes);
  await app.register(audioRoutes);

  return app;
}


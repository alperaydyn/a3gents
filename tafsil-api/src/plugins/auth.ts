import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config/env.js";
import { fail } from "../utils/response.js";

import { query } from "../db/client.js";

export interface SessionTokenPayload {
  sub: string; // kullanici id (UUID)
  authProvider: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionTokenPayload;
    user: SessionTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorizeAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send(fail("UNAUTHORIZED", "Geçersiz veya eksik oturum token'ı"));
    }
  });

  app.decorate("authorizeAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send(fail("UNAUTHORIZED", "Oturum token'ı geçersiz"));
      }

      const res = await query<{ role: string }>("SELECT role FROM kullanicilar WHERE id = $1", [userId]);
      if (!res.rows[0] || res.rows[0].role !== "admin") {
        return reply.status(403).send(fail("FORBIDDEN", "Bu işlem için yönetici yetkisi gereklidir"));
      }
    } catch {
      return reply.status(401).send(fail("UNAUTHORIZED", "Geçersiz veya eksik yönetici token'ı"));
    }
  });
});

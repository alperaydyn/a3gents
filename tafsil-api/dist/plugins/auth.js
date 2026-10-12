"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const env_js_1 = require("../config/env.js");
const response_js_1 = require("../utils/response.js");
const client_js_1 = require("../db/client.js");
exports.authPlugin = (0, fastify_plugin_1.default)(async (app) => {
    await app.register(jwt_1.default, {
        secret: env_js_1.config.jwt.secret,
        sign: { expiresIn: env_js_1.config.jwt.expiresIn },
    });
    app.decorate("authenticate", async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch {
            reply.status(401).send((0, response_js_1.fail)("UNAUTHORIZED", "Geçersiz veya eksik oturum token'ı"));
        }
    });
    app.decorate("authorizeAdmin", async (request, reply) => {
        try {
            await request.jwtVerify();
            const userId = request.user?.sub;
            if (!userId) {
                return reply.status(401).send((0, response_js_1.fail)("UNAUTHORIZED", "Oturum token'ı geçersiz"));
            }
            const res = await (0, client_js_1.query)("SELECT role FROM kullanicilar WHERE id = $1", [userId]);
            if (!res.rows[0] || res.rows[0].role !== "admin") {
                return reply.status(403).send((0, response_js_1.fail)("FORBIDDEN", "Bu işlem için yönetici yetkisi gereklidir"));
            }
        }
        catch {
            return reply.status(401).send((0, response_js_1.fail)("UNAUTHORIZED", "Geçersiz veya eksik yönetici token'ı"));
        }
    });
});

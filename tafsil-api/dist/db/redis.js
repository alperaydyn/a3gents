"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.l1Get = l1Get;
exports.l1Set = l1Set;
exports.l2Get = l2Get;
exports.l2Set = l2Set;
exports.del = del;
const ioredis_1 = __importDefault(require("ioredis"));
const env_js_1 = require("../config/env.js");
let _redis = null;
function getRedis() {
    if (!_redis) {
        _redis = new ioredis_1.default(env_js_1.config.redis.url, {
            maxRetriesPerRequest: 3,
            ...(env_js_1.config.redis.password ? { password: env_js_1.config.redis.password } : {}),
        });
        _redis.on("error", (err) => {
            console.error("Redis bağlantı hatası:", err);
        });
    }
    return _redis;
}
// ── L1: TTL'siz immutable Kur'an verisi (metin, meal, kök sözlüğü) ─────────
// Anahtar formatı: quran:sure:{id}, quran:ayet:{sure}:{no}, lexicon:word:{id}
async function l1Get(key) {
    const raw = await getRedis().get(key);
    return raw ? JSON.parse(raw) : null;
}
async function l1Set(key, value) {
    await getRedis().set(key, JSON.stringify(value));
}
// ── L2: TTL'li dinamik / kişisel veri ───────────────────────────────────────
// Anahtar formatı: daily:cards:{date}, dag:node:{id}:neighbors, rag:session:{id}:context
async function l2Get(key) {
    const raw = await getRedis().get(key);
    return raw ? JSON.parse(raw) : null;
}
async function l2Set(key, value, ttlSeconds) {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
}
async function del(key) {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length > 0) {
        await getRedis().del(...keys);
    }
}

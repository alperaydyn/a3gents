import Redis from "ioredis";
import { config } from "../config/env.js";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      ...(config.redis.password ? { password: config.redis.password } : {}),
    });

    _redis.on("error", (err) => {
      console.error("Redis bağlantı hatası:", err);
    });
  }
  return _redis;
}

// ── L1: TTL'siz immutable Kur'an verisi (metin, meal, kök sözlüğü) ─────────
// Anahtar formatı: quran:sure:{id}, quran:ayet:{sure}:{no}, lexicon:word:{id}
export async function l1Get<T>(key: string): Promise<T | null> {
  const raw = await getRedis().get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function l1Set<T>(key: string, value: T): Promise<void> {
  await getRedis().set(key, JSON.stringify(value));
}

// ── L2: TTL'li dinamik / kişisel veri ───────────────────────────────────────
// Anahtar formatı: daily:cards:{date}, dag:node:{id}:neighbors, rag:session:{id}:context
export async function l2Get<T>(key: string): Promise<T | null> {
  const raw = await getRedis().get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function l2Set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function del(key: string | string[]): Promise<void> {
  const keys = Array.isArray(key) ? key : [key];
  if (keys.length > 0) {
    await getRedis().del(...keys);
  }
}

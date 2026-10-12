import dotenv from "dotenv";
import path from "path";

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const INSECURE_JWT_DEFAULT = "dev-only-insecure-secret-change-me";
const jwtSecret = process.env.JWT_SECRET || INSECURE_JWT_DEFAULT;

// PBI-9.2: Prodüksiyonda güvensiz/eksik JWT secret ile başlatmayı reddet.
if (
  isProduction &&
  (jwtSecret === INSECURE_JWT_DEFAULT || jwtSecret.startsWith("CHANGE_ME") || jwtSecret.length < 32)
) {
  throw new Error(
    "[config] JWT_SECRET prodüksiyonda tanımlı ve en az 32 karakter olmalıdır. Sunucu başlatılmadı."
  );
}

export const config = {
  env: nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || "4000", 10),
  host: process.env.HOST || "0.0.0.0",
  logLevel: process.env.LOG_LEVEL || "info",

  // PostgreSQL Connections
  db: {
    host: process.env.POSTGRES_HOST || "localhost",
    url: process.env.DATABASE_URL || "postgres://tafsil:tafsil_dev_secret@localhost:5432/tafsil_db",
    directUrl: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || "postgres://tafsil:tafsil_dev_secret@localhost:5432/tafsil_db",
    user: process.env.POSTGRES_USER || "tafsil",
    password: process.env.POSTGRES_PASSWORD || "tafsil_dev_secret",
    database: process.env.POSTGRES_DB || "tafsil_db",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    // URL içinde şifre yoksa REDIS_PASSWORD kullanılır.
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: jwtSecret,
    // Beta (TestFlight F&F) süresince refresh token olmadığından uzun ömürlü oturum (PBI-9.6).
    expiresIn: process.env.JWT_EXPIRES_IN || "90d",
  },

  auth: {
    /**
     * `google-dev-*`, `apple-dev-*`, `mock-*` sahte id_token'ların kabul edilip edilmeyeceği.
     * ALLOW_DEV_AUTH_TOKENS=true açıkça verilirse staging/test için prodüksiyonda da izin verilir.
     */
    allowDevTokens:
      process.env.ALLOW_DEV_AUTH_TOKENS === "true" ||
      (!isProduction && process.env.ALLOW_DEV_AUTH_TOKENS !== "false"),
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || "net.tafsil.app",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
    },
  },

  rateLimit: {
    general: parseInt(process.env.RATE_LIMIT_GENERAL || "60", 10),
  },

  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

import pg from "pg";
import { config } from "../config/env.js";

const { Pool, Client } = pg;

let _pool: pg.Pool | null = null;

// Lazy Runtime Application Connection Pool (via PgBouncer on port 6432)
export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.db.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    _pool.on("error", (err) => {
      console.error("Beklenmeyen PgBouncer Pool hatası:", err);
    });
  }
  return _pool;
}

// Helper for single query execution via runtime pool
export const query = <T extends pg.QueryResultRow = any>(text: string, params?: any[]) =>
  getPool().query<T>(text, params);

// Direct PostgreSQL Client Factory (for migrations and large batch seeds on port 5432)
export function getDirectClient() {
  return new Client({
    connectionString: config.db.directUrl,
  });
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
exports.getPool = getPool;
exports.getDirectClient = getDirectClient;
const pg_1 = __importDefault(require("pg"));
const env_js_1 = require("../config/env.js");
const { Pool, Client } = pg_1.default;
let _pool = null;
// Lazy Runtime Application Connection Pool (via PgBouncer on port 6432)
function getPool() {
    if (!_pool) {
        _pool = new Pool({
            connectionString: env_js_1.config.db.url,
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
const query = (text, params) => getPool().query(text, params);
exports.query = query;
// Direct PostgreSQL Client Factory (for migrations and large batch seeds on port 5432)
function getDirectClient() {
    return new Client({
        connectionString: env_js_1.config.db.directUrl,
    });
}

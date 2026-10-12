"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_js_1 = require("./client.js");
async function runMigrations() {
    const client = (0, client_js_1.getDirectClient)();
    console.log("Migration başlatılıyor (Doğrudan PostgreSQL bağlantısı: DATABASE_URL_DIRECT)...");
    try {
        await client.connect();
        console.log("✓ Veritabanı bağlantısı kuruldu.");
        const migrationsDir = path_1.default.resolve(process.cwd(), "src/db/migrations");
        if (!fs_1.default.existsSync(migrationsDir)) {
            throw new Error(`Migration dizini bulunamadı: ${migrationsDir}`);
        }
        const files = fs_1.default.readdirSync(migrationsDir)
            .filter(f => f.endsWith(".sql") && f !== "init.sql")
            .sort();
        for (const file of files) {
            const filePath = path_1.default.join(migrationsDir, file);
            const sql = fs_1.default.readFileSync(filePath, "utf-8");
            console.log(`✓ ${file} dosyası okunuyor ve çalıştırılıyor...`);
            await client.query(sql);
            console.log(`✓ ${file} başarıyla tamamlandı.`);
        }
    }
    catch (error) {
        console.error("✕ Migration hatası:", error);
        process.exit(1);
    }
    finally {
        await client.end();
    }
}
runMigrations();

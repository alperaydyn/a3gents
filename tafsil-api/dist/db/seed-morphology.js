"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_js_1 = require("./client.js");
async function runMorphologySeed() {
    const client = (0, client_js_1.getDirectClient)();
    console.log("Kapsamlı Morfoloji ve Kök seed işlemi başlatılıyor (DATABASE_URL_DIRECT)...");
    try {
        await client.connect();
        console.log("✓ Veritabanı bağlantısı kuruldu.");
        // Path to generated morphology SQL seed file
        const seedFile = path_1.default.resolve(process.cwd(), "../data-pipeline/seed/morphology_seed.sql");
        if (!fs_1.default.existsSync(seedFile)) {
            throw new Error(`Seed dosyası bulunamadı: ${seedFile}. Lütfen önce data-pipeline/scripts/generate-morphology-seed.py scriptini çalıştırın.`);
        }
        console.log(`✓ ${path_1.default.basename(seedFile)} dosyası yükleniyor (1642 kök, 77.429 kelime)...`);
        const sql = fs_1.default.readFileSync(seedFile, "utf-8");
        const startTime = Date.now();
        await client.query(sql);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        // Verify row counts and integrity
        const kokCount = await client.query("SELECT COUNT(*) FROM kokler");
        const kelimeCount = await client.query("SELECT COUNT(*) FROM kelimeler");
        const kelimeWithKok = await client.query("SELECT COUNT(*) FROM kelimeler WHERE kok_id IS NOT NULL");
        console.log(`✓ Morfoloji seed işlemi başarıyla tamamlandı (${duration}s)!`);
        console.log(`  - Kökler Tablosu: ${kokCount.rows[0].count} kayıt`);
        console.log(`  - Kelimeler Tablosu: ${kelimeCount.rows[0].count} kayıt`);
        console.log(`  - Kökü Olan Kelimeler: ${kelimeWithKok.rows[0].count} kayıt`);
    }
    catch (error) {
        console.error("✕ Morfoloji seed hatası:", error);
        process.exit(1);
    }
    finally {
        await client.end();
    }
}
runMorphologySeed();

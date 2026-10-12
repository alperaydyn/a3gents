import fs from "fs";
import path from "path";
import { getDirectClient } from "./client.js";

async function runSeed() {
  const client = getDirectClient();
  console.log("Kur'an seed işlemi başlatılıyor (DATABASE_URL_DIRECT)...");

  try {
    await client.connect();
    console.log("✓ Veritabanı bağlantısı kuruldu.");

    // Path to generated SQL seed file
    const seedFile = path.resolve(process.cwd(), "../data-pipeline/seed/quran_seed.sql");
    if (!fs.existsSync(seedFile)) {
      throw new Error(`Seed dosyası bulunamadı: ${seedFile}. Lütfen önce seeder scriptini çalıştırın.`);
    }

    console.log(`✓ ${path.basename(seedFile)} dosyası yükleniyor (6236 ayet, 114 sure)...`);
    const sql = fs.readFileSync(seedFile, "utf-8");

    const startTime = Date.now();
    await client.query(sql);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Verify row counts
    const surahCount = await client.query("SELECT COUNT(*) FROM sureler");
    const ayahCount = await client.query("SELECT COUNT(*) FROM ayetler");

    console.log(`✓ Seed başarıyla tamamlandı (${duration}s)!`);
    console.log(`  - Sureler Tablosu: ${surahCount.rows[0].count} kayıt`);
    console.log(`  - Ayetler Tablosu: ${ayahCount.rows[0].count} kayıt`);
  } catch (error) {
    console.error("✕ Seed hatası:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();

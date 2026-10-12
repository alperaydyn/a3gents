import fs from "fs";
import path from "path";
import { getDirectClient } from "./client.js";

async function runMorphologySeed() {
  const client = getDirectClient();
  console.log("Kapsamlı Morfoloji ve Kök seed işlemi başlatılıyor (DATABASE_URL_DIRECT)...");

  try {
    await client.connect();
    console.log("✓ Veritabanı bağlantısı kuruldu.");

    // Path to generated morphology SQL seed file
    const seedFile = path.resolve(process.cwd(), "../data-pipeline/seed/morphology_seed.sql");
    if (!fs.existsSync(seedFile)) {
      throw new Error(`Seed dosyası bulunamadı: ${seedFile}. Lütfen önce data-pipeline/scripts/generate-morphology-seed.py scriptini çalıştırın.`);
    }

    console.log(`✓ ${path.basename(seedFile)} dosyası yükleniyor (1642 kök, 77.429 kelime)...`);
    const sql = fs.readFileSync(seedFile, "utf-8");

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
  } catch (error) {
    console.error("✕ Morfoloji seed hatası:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMorphologySeed();

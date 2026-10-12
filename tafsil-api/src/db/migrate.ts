import fs from "fs";
import path from "path";
import { getDirectClient } from "./client.js";

async function runMigrations() {
  const client = getDirectClient();
  console.log("Migration başlatılıyor (Doğrudan PostgreSQL bağlantısı: DATABASE_URL_DIRECT)...");

  try {
    await client.connect();
    console.log("✓ Veritabanı bağlantısı kuruldu.");

    const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migration dizini bulunamadı: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql") && f !== "init.sql")
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      console.log(`✓ ${file} dosyası okunuyor ve çalıştırılıyor...`);
      await client.query(sql);
      console.log(`✓ ${file} başarıyla tamamlandı.`);
    }
  } catch (error) {
    console.error("✕ Migration hatası:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

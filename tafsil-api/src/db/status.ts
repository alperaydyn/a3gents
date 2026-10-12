import { getDirectClient } from "./client.js";

async function checkStatus() {
  const client = getDirectClient();
  console.log("Veritabanı bağlantı ve tablo durumu kontrol ediliyor...");

  try {
    await client.connect();
    console.log("✓ PostgreSQL bağlantısı başarılı.");

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log("\nMevcut Tablolar:");
    for (const row of tablesRes.rows) {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      console.log(`  - ${row.table_name.padEnd(24)}: ${countRes.rows[0].count} kayıt`);
    }

    const vectorExtRes = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'vector';
    `);
    if (vectorExtRes.rows.length > 0) {
      console.log(`\n✓ pgvector eklentisi aktif (Sürüm: ${vectorExtRes.rows[0].extversion})`);
    } else {
      console.log("\n⚠️ pgvector eklentisi henüz yüklenmemiş.");
    }
  } catch (error) {
    console.error("✕ Durum sorgulama hatası:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkStatus();

#!/usr/bin/env node
/**
 * data-pipeline/ kaynağından statik bir anlık görüntü (snapshot) üretir.
 * Backend API (BE-006/BE-007) hazır olmadan deep link sayfalarını (WEB-003/WEB-004)
 * gerçek Kur'an metniyle çalıştırmak için kullanılır. API hazır olunca src/lib/api.ts
 * içindeki USE_MOCK bayrağı false yapılır; bu snapshot referans/fallback olarak kalır.
 *
 * Kaynaklar (salt okunur, yalnızca Agent-01 alanından okunur):
 *   - data-pipeline/uthmani.txt          → Uthmani hatlı orijinal Arapça metin
 *   - data-pipeline/kuran-meal-llm.json  → Türkçe meal (LLM tabanlı, gözden geçirilmemiş taslak)
 *
 * Çalıştırma: npm run snapshot:quran
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DP = path.join(ROOT, 'data-pipeline');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data');

const uthmaniRaw = readFileSync(path.join(DP, 'uthmani.txt'), 'utf-8');
const mealRaw = JSON.parse(readFileSync(path.join(DP, 'kuran-meal-llm.json'), 'utf-8'));

const arabicByKey = new Map();
for (const line of uthmaniRaw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('id|sureno')) continue;
  const [, sureno, ayetno, text] = trimmed.split('|');
  arabicByKey.set(`${sureno}:${ayetno}`, text);
}

const mealByKey = new Map();
for (const entry of mealRaw) {
  mealByKey.set(`${entry.surah_number}:${entry.ayah_number}`, entry);
}

const ayetler = [];
for (const [key, meal] of mealByKey) {
  const [s, a] = key.split(':').map(Number);
  const ar = arabicByKey.get(key);
  if (!ar) continue;
  const translit = (meal.sentence_blocks || []).map((b) => b.display_text).join(' ');
  ayetler.push({
    s,
    a,
    ar,
    tr: meal.ayah_translation,
    translit,
  });
}
ayetler.sort((x, y) => (x.s - y.s) || (x.a - y.a));

writeFileSync(
  path.join(OUT_DIR, 'ayetler.snapshot.json'),
  JSON.stringify(ayetler),
);

console.log(`✓ ${ayetler.length} ayet yazıldı → src/data/ayetler.snapshot.json`);
console.log('⚠ Meal metni data-pipeline/kuran-meal-llm.json kaynaklıdır (LLM taslağı, DP-006/007 ile editoryal onaydan geçmemiştir). Yalnızca arayüz geliştirme amaçlıdır.');

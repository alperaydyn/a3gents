-- ══════════════════════════════════════════════════════════════════════
-- tafsil.net — Migration 001: Initial Schema
-- ══════════════════════════════════════════════════════════════════════

-- 1. Eklentiler (Extensions)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Sureler Tablosu (1..114 Sure)
CREATE TABLE IF NOT EXISTS sureler (
    id SMALLINT PRIMARY KEY,
    ad_tr VARCHAR(64) NOT NULL,
    ad_ar VARCHAR(64) NOT NULL,
    nuzul_sirasi SMALLINT NOT NULL,
    donem VARCHAR(32) NOT NULL CHECK (donem IN ('erken_mekke', 'orta_mekke', 'gec_mekke', 'medine')),
    ayet_sayisi SMALLINT NOT NULL,
    aciklama TEXT
);

-- 3. Ayetler Tablosu (Uthmani Metin, Mealler ve pgvector Embedding)
CREATE TABLE IF NOT EXISTS ayetler (
    id SERIAL PRIMARY KEY,
    sure_id SMALLINT NOT NULL REFERENCES sureler(id) ON DELETE CASCADE,
    ayet_no SMALLINT NOT NULL,
    cuz_no SMALLINT NOT NULL DEFAULT 1,
    sayfa_no SMALLINT NOT NULL DEFAULT 1,
    metin_ar TEXT NOT NULL,
    transliterasyon_tr TEXT DEFAULT '',
    meal_tr TEXT DEFAULT '',
    ses_dosyasi_url VARCHAR(255),
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sure_id, ayet_no)
);

-- 4. Morfolojik Kökler Sözlüğü
CREATE TABLE IF NOT EXISTS kokler (
    id SERIAL PRIMARY KEY,
    kok_ar VARCHAR(16) NOT NULL UNIQUE,
    kok_tr VARCHAR(32) NOT NULL,
    kok_anlami TEXT
);

-- 5. Kelimeler ve Zaman Damgaları (Word-Level Karaoke Timestamps)
CREATE TABLE IF NOT EXISTS kelimeler (
    id SERIAL PRIMARY KEY,
    ayet_id INT NOT NULL REFERENCES ayetler(id) ON DELETE CASCADE,
    kelime_no SMALLINT NOT NULL,
    metin_ar VARCHAR(64) NOT NULL,
    metin_tr VARCHAR(64) DEFAULT '',
    kok_id INT REFERENCES kokler(id) ON DELETE SET NULL,
    vezin VARCHAR(32),
    start_ms INT NOT NULL DEFAULT 0,
    end_ms INT NOT NULL DEFAULT 0,
    UNIQUE (ayet_id, kelime_no)
);

-- 6. Kavramlar (Semantik Kavram Ağı)
CREATE TABLE IF NOT EXISTS kavramlar (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL,
    baslik_tr VARCHAR(128) NOT NULL,
    baslik_ar VARCHAR(128),
    tanim TEXT NOT NULL,
    onaylandi BOOLEAN DEFAULT FALSE,
    olusturan_id UUID,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Kavram İlişkileri (Yönlü Çevrimsiz Graf - DAG)
CREATE TABLE IF NOT EXISTS kavram_iliskileri (
    id SERIAL PRIMARY KEY,
    kaynak_kavram_id INT NOT NULL REFERENCES kavramlar(id) ON DELETE CASCADE,
    hedef_kavram_id INT NOT NULL REFERENCES kavramlar(id) ON DELETE CASCADE,
    iliski_tipi VARCHAR(32) NOT NULL CHECK (iliski_tipi IN ('es_anlam', 'zit_anlam', 'kapsama', 'sebep_sonuc', 'iliskili')),
    agirlik NUMERIC(3,2) DEFAULT 1.00,
    UNIQUE (kaynak_kavram_id, hedef_kavram_id, iliski_tipi)
);

-- 8. Ayet Blokları (Tematik Bağlam Grupları)
CREATE TABLE IF NOT EXISTS ayet_bloklari (
    id SERIAL PRIMARY KEY,
    sure_id SMALLINT NOT NULL REFERENCES sureler(id) ON DELETE CASCADE,
    baslangic_ayet SMALLINT NOT NULL,
    bitis_ayet SMALLINT NOT NULL,
    baslik_tr VARCHAR(255) NOT NULL,
    aciklama TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Cümle ve Alt-Cümle Blokları (Kavram Etiketli)
CREATE TABLE IF NOT EXISTS cumle_bloklari (
    id SERIAL PRIMARY KEY,
    ayet_id INT NOT NULL REFERENCES ayetler(id) ON DELETE CASCADE,
    cumle_index SMALLINT NOT NULL,
    metin_ar TEXT NOT NULL,
    metin_tr TEXT NOT NULL,
    kavramlar TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Kullanıcılar (Gizlilik Odaklı Anonim/OAuth)
CREATE TABLE IF NOT EXISTS kullanicilar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider VARCHAR(32) NOT NULL,
    auth_provider_id VARCHAR(128) NOT NULL UNIQUE,
    tercih_modu VARCHAR(16) DEFAULT 'ogrenme' CHECK (tercih_modu IN ('kesif', 'ogrenme', 'odak')),
    dil VARCHAR(8) DEFAULT 'tr',
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Ezber Oturumları (SM-2 Algoritması & Aralıklı Tekrar)
CREATE TABLE IF NOT EXISTS ezber_oturumlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    sure_id SMALLINT NOT NULL REFERENCES sureler(id),
    baslangic_ayet SMALLINT NOT NULL,
    bitis_ayet SMALLINT NOT NULL,
    durum VARCHAR(32) DEFAULT 'ogreniliyor' CHECK (durum IN ('ogreniliyor', 'kor_okuma', 'tekrar_bekliyor', 'pekistirildi')),
    repetition_number INT DEFAULT 0,
    interval_days INT DEFAULT 1,
    ease_factor NUMERIC(4,2) DEFAULT 2.50,
    next_review_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Anlama Çalışmaları (Agentic RAG Araştırma Oturumları)
CREATE TABLE IF NOT EXISTS anlama_oturumlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    baslik VARCHAR(255) NOT NULL,
    odak_kavramlar TEXT[] DEFAULT '{}',
    sentez_ozeti TEXT,
    onerilen_okuma_sirasi INT[] DEFAULT '{}',
    durum VARCHAR(32) DEFAULT 'tamamlandi',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════
-- İndeksler ve Performans Optimizasyonu
-- ══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sureler_nuzul ON sureler (nuzul_sirasi);
CREATE INDEX IF NOT EXISTS idx_ayetler_sure_ayet ON ayetler (sure_id, ayet_no);
CREATE INDEX IF NOT EXISTS idx_ayetler_sayfa ON ayetler (sayfa_no);
CREATE INDEX IF NOT EXISTS idx_ayetler_cuz ON ayetler (cuz_no);
CREATE INDEX IF NOT EXISTS idx_kelimeler_ayet ON kelimeler (ayet_id);
CREATE INDEX IF NOT EXISTS idx_kelimeler_kok ON kelimeler (kok_id);
CREATE INDEX IF NOT EXISTS idx_kavramlar_slug ON kavramlar (slug);
CREATE INDEX IF NOT EXISTS idx_kavram_iliskileri_kaynak ON kavram_iliskileri (kaynak_kavram_id);
CREATE INDEX IF NOT EXISTS idx_kavram_iliskileri_hedef ON kavram_iliskileri (hedef_kavram_id);
CREATE INDEX IF NOT EXISTS idx_ezber_kullanici_review ON ezber_oturumlari (kullanici_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_anlama_kullanici ON anlama_oturumlari (kullanici_id);

CREATE INDEX IF NOT EXISTS idx_ayetler_fts_meal ON ayetler USING gin (to_tsvector('simple', coalesce(meal_tr, '')));
CREATE INDEX IF NOT EXISTS idx_ayetler_fts_translit ON ayetler USING gin (to_tsvector('simple', coalesce(transliterasyon_tr, '')));
CREATE INDEX IF NOT EXISTS idx_kavramlar_fts ON kavramlar USING gin (to_tsvector('simple', coalesce(baslik_tr, '') || ' ' || coalesce(tanim, '')));

CREATE INDEX IF NOT EXISTS idx_ayetler_embedding ON ayetler USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kavramlar_embedding ON kavramlar USING hnsw (embedding vector_cosine_ops);

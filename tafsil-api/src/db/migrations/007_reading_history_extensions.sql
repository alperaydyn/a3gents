-- ==============================================================================
-- tafsil.net — Phase 7: Kavram Geçmişi Log Tablosu ve Ezber Oturumu Başlıkları
-- ==============================================================================

-- 1. Kavram Geçmişi (Concept History Log) Tablosu
CREATE TABLE IF NOT EXISTS kavram_gecmisi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    kavram_id INT REFERENCES kavramlar(id) ON DELETE SET NULL,
    kavram_slug VARCHAR(64) NOT NULL,
    kavram_adi VARCHAR(128) NOT NULL,
    incelenme_suresi_sn INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kavram_gecmisi_user ON kavram_gecmisi(kullanici_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kavram_gecmisi_slug ON kavram_gecmisi(kavram_slug);

-- 2. Ezber Oturumları Tablosuna İsim/Başlık Kolonu Ekleme
ALTER TABLE ezber_oturumlari ADD COLUMN IF NOT EXISTS baslik VARCHAR(128);


-- ==============================================================================
-- tafsil.net — Phase 6: Offline Sync, Bookmarks, Reading History & Audio Sources
-- ==============================================================================

-- 1. Yer İmleri (Bookmarks) Tablosu
CREATE TABLE IF NOT EXISTS yer_imleri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    sure_id SMALLINT NOT NULL REFERENCES sureler(id),
    ayet_no SMALLINT NOT NULL,
    etiket VARCHAR(64) DEFAULT 'Genel',
    notlar TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (kullanici_id, sure_id, ayet_no)
);

CREATE INDEX IF NOT EXISTS idx_yer_imleri_user ON yer_imleri(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_yer_imleri_updated ON yer_imleri(updated_at);

-- 2. Okuma Geçmişi (Reading History) Tablosu
CREATE TABLE IF NOT EXISTS okuma_gecmisi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    sure_id SMALLINT NOT NULL REFERENCES sureler(id),
    ayet_no SMALLINT NOT NULL,
    okunma_suresi_sn INT DEFAULT 0,
    okundu_tarihi TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okuma_gecmisi_user ON okuma_gecmisi(kullanici_id, okundu_tarihi DESC);

-- 3. Ses Kaynakları ve Kâri Listesi Tablosu
CREATE TABLE IF NOT EXISTS ses_kaynaklari (
    id SERIAL PRIMARY KEY,
    kari_id VARCHAR(32) NOT NULL,
    kari_adi VARCHAR(64) NOT NULL,
    dil VARCHAR(8) NOT NULL DEFAULT 'ar', -- ar, tr, en
    sure_id SMALLINT NOT NULL REFERENCES sureler(id),
    ayet_no SMALLINT NOT NULL,
    ses_url VARCHAR(255) NOT NULL,
    format VARCHAR(16) DEFAULT 'audio/mp3',
    UNIQUE(kari_id, sure_id, ayet_no)
);

CREATE INDEX IF NOT EXISTS idx_ses_kaynaklari_sure ON ses_kaynaklari(sure_id, ayet_no);

-- 4. Örnek Kâri ve Ses Verileri Tohumu (Fatiha 1:1-7 ve Alak 96:1-5)
INSERT INTO ses_kaynaklari (kari_id, kari_adi, dil, sure_id, ayet_no, ses_url)
VALUES
  -- Mishary Rashid Alafasy (Arapça) - Fatiha
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 1, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 2, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 3, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/3.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 4, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/4.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 5, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/5.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 6, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 1, 7, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/7.mp3'),
  -- Mishary Rashid Alafasy (Arapça) - Alak (1-5)
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 96, 1, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6106.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 96, 2, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6107.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 96, 3, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6108.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 96, 4, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6109.mp3'),
  ('mishary_alafasy', 'Mishary Rashid Alafasy', 'ar', 96, 5, 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6110.mp3'),
  -- Hamdi Yazır Türkçe Meal Seslendirmesi - Fatiha
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 1, 'https://cdn.tafsil.net/audio/tr/meal/1_1.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 2, 'https://cdn.tafsil.net/audio/tr/meal/1_2.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 3, 'https://cdn.tafsil.net/audio/tr/meal/1_3.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 4, 'https://cdn.tafsil.net/audio/tr/meal/1_4.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 5, 'https://cdn.tafsil.net/audio/tr/meal/1_5.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 6, 'https://cdn.tafsil.net/audio/tr/meal/1_6.mp3'),
  ('hamdi_yazir_tr', 'Elmalılı Hamdi Yazır (Seslendirme)', 'tr', 1, 7, 'https://cdn.tafsil.net/audio/tr/meal/1_7.mp3')
ON CONFLICT (kari_id, sure_id, ayet_no) DO UPDATE 
SET ses_url = EXCLUDED.ses_url, kari_adi = EXCLUDED.kari_adi;

-- 5. Örnek Kullanıcı Yer İmleri ve Okuma Geçmişi Tohumu
DO $$
DECLARE
    sample_user_id UUID;
BEGIN
    SELECT id INTO sample_user_id FROM kullanicilar LIMIT 1;
    IF sample_user_id IS NOT NULL THEN
        INSERT INTO yer_imleri (kullanici_id, sure_id, ayet_no, etiket, notlar)
        VALUES 
            (sample_user_id, 1, 1, 'Tefekkür', 'Besmele üzerine özel odak'),
            (sample_user_id, 96, 1, 'İlk Vahiy', 'Alak suresi 1. ayet okuma emri')
        ON CONFLICT (kullanici_id, sure_id, ayet_no) DO NOTHING;

        INSERT INTO okuma_gecmisi (kullanici_id, sure_id, ayet_no, okunma_suresi_sn)
        VALUES 
            (sample_user_id, 1, 1, 45),
            (sample_user_id, 1, 2, 30),
            (sample_user_id, 96, 1, 60);
    END IF;
END $$;

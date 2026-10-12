-- 004_phase5_admin_multilingual.sql: Phase 5 Admin & Multi-language Schema

-- 1. Kullanıcılar tablosuna rol sütunu ekleme
ALTER TABLE kullanicilar
ADD COLUMN IF NOT EXISTS role VARCHAR(16) DEFAULT 'user';

-- 2. Ayetler tablosuna İngilizce meal ve editoryal bağlam sütunları
ALTER TABLE ayetler
ADD COLUMN IF NOT EXISTS meal_en TEXT,
ADD COLUMN IF NOT EXISTS baglam_en TEXT;

-- 3. Kelimeler tablosuna İngilizce kelime meali sütunu
ALTER TABLE kelimeler
ADD COLUMN IF NOT EXISTS metin_en VARCHAR(64);

-- 4. Anlama oturumlarına öne çıkarma ve moderasyon durumu sütunları
ALTER TABLE anlama_oturumlari
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'onaylandi';

-- 5. Admin Denetim / Audit Kayıtları tablosu
CREATE TABLE IF NOT EXISTS admin_denetim_kayitlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES kullanicilar(id) ON DELETE SET NULL,
    islem_tipi VARCHAR(64) NOT NULL,
    hedef_varlik VARCHAR(64) NOT NULL,
    hedef_id VARCHAR(64),
    detaylar JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_denetim_kayitlari(created_at DESC);

-- 6. Varsayılan Admin Kullanıcısı
-- Eski test id'sini temizleyip kalıcı id veriyoruz
DELETE FROM kullanicilar WHERE id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO kullanicilar (id, auth_provider, auth_provider_id, tercih_modu, dil, is_premium, role)
VALUES (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'admin',
    'admin@tafsil.net',
    'kesif',
    'tr',
    TRUE,
    'admin'
)
ON CONFLICT (auth_provider_id) DO UPDATE
SET role = 'admin', is_premium = TRUE;

-- 7. Fatiha (Sure 1) Türkçe ve İngilizce Mealleri
UPDATE ayetler SET 
  meal_tr = 'Rahmân ve Rahîm olan Allah''ın adıyla.',
  meal_en = 'In the name of Allah, the Entirely Merciful, the Especially Merciful.'
WHERE sure_id = 1 AND ayet_no = 1;

UPDATE ayetler SET 
  meal_tr = 'Hamd, âlemlerin Rabbi Allah''a mahsustur.',
  meal_en = '[All] praise is [due] to Allah, Lord of the worlds —'
WHERE sure_id = 1 AND ayet_no = 2;

UPDATE ayetler SET 
  meal_tr = 'O, Rahmândır, Rahîmdir.',
  meal_en = 'The Entirely Merciful, the Especially Merciful,'
WHERE sure_id = 1 AND ayet_no = 3;

UPDATE ayetler SET 
  meal_tr = 'Din gününün sahibidir.',
  meal_en = 'Sovereign of the Day of Recompense.'
WHERE sure_id = 1 AND ayet_no = 4;

UPDATE ayetler SET 
  meal_tr = 'Yalnız sana ibadet eder, yalnız senden yardım dileriz.',
  meal_en = 'It is You we worship and You we ask for help.'
WHERE sure_id = 1 AND ayet_no = 5;

UPDATE ayetler SET 
  meal_tr = 'Bizi doğru yola ilet;',
  meal_en = 'Guide us to the straight path —'
WHERE sure_id = 1 AND ayet_no = 6;

UPDATE ayetler SET 
  meal_tr = 'Kendilerine nimet verdiklerinin yoluna; gazaba uğrayanların ve sapıtanlarınkine değil.',
  meal_en = 'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.'
WHERE sure_id = 1 AND ayet_no = 7;

-- 8. Alak Suresi (Sure 96) İlk 5 Ayet Türkçe ve İngilizce Meal ve Bağlam (Tafsil.dc.html Ekran #06)
UPDATE ayetler SET 
  meal_tr = 'Yaratan Rabbinin adıyla oku!',
  meal_en = 'Read, in the name of your Lord who created —',
  baglam_en = 'The first command revealed to Prophet Muhammad. Reading ("iqra") implies gathering knowledge and synthesizing.'
WHERE sure_id = 96 AND ayet_no = 1;

UPDATE ayetler SET 
  meal_tr = 'O, insanı bir alaktan yarattı.',
  meal_en = 'created the human being from ''alaq, a thing that clings.',
  baglam_en = 'Often rendered "clot of blood". The root''s earliest sense is attachment — something suspended or clinging.'
WHERE sure_id = 96 AND ayet_no = 2;

UPDATE ayetler SET 
  meal_tr = 'Oku! Rabbin sonsuz kerem sahibidir.',
  meal_en = 'Read, and your Lord is the most generous,',
  baglam_en = 'Divine benevolence ("al-Akram") frames the act of teaching as a generous gift.'
WHERE sure_id = 96 AND ayet_no = 3;

UPDATE ayetler SET 
  meal_tr = 'O ki kalemle öğretti,',
  meal_en = 'who taught by the pen,',
  baglam_en = 'The pen represents recording, crystallization of oral revelation into lasting knowledge.'
WHERE sure_id = 96 AND ayet_no = 4;

UPDATE ayetler SET 
  meal_tr = 'İnsana bilmediğini öğretti.',
  meal_en = 'taught the human what it did not know.',
  baglam_en = 'The ultimate realization of knowledge as coming from a transcendent source.'
WHERE sure_id = 96 AND ayet_no = 5;

-- 9. Fatiha kelimeleri için örnek İngilizce karşılıklar
UPDATE kelimeler SET metin_en = 'In [the] name' WHERE metin_tr ILIKE '%adıyla%' OR metin_tr ILIKE '%ismiyle%';
UPDATE kelimeler SET metin_en = 'of Allah' WHERE metin_tr ILIKE '%Allah''ın%';
UPDATE kelimeler SET metin_en = 'the Entirely Merciful' WHERE metin_tr ILIKE '%Rahman%';
UPDATE kelimeler SET metin_en = 'the Especially Merciful' WHERE metin_tr ILIKE '%Rahim%';
UPDATE kelimeler SET metin_en = '[All] praise' WHERE metin_tr ILIKE '%Hamd%';
UPDATE kelimeler SET metin_en = 'Lord' WHERE metin_tr ILIKE '%Rabbi%';
UPDATE kelimeler SET metin_en = 'of the worlds' WHERE metin_tr ILIKE '%Alemler%';

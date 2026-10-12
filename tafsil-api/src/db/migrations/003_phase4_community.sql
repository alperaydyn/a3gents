-- ══════════════════════════════════════════════════════════════════════
-- tafsil.net — Migration 003: Phase 4 Community, Social & Editorial
-- Topluluk Havuzu, Beğeni/Çatallama, Makaleler ve Kur'an Referansları
-- ══════════════════════════════════════════════════════════════════════

-- 1. Anlama Oturumlarına Topluluk / Paylaşım Sütunları
ALTER TABLE anlama_oturumlari ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE anlama_oturumlari ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE anlama_oturumlari ADD COLUMN IF NOT EXISTS fork_count INT DEFAULT 0;
ALTER TABLE anlama_oturumlari ADD COLUMN IF NOT EXISTS source_session_id UUID REFERENCES anlama_oturumlari(id) ON DELETE SET NULL;

-- 2. Topluluk Beğenileri (Like Tablosu)
CREATE TABLE IF NOT EXISTS topluluk_begenileri (
    user_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    oturum_id UUID NOT NULL REFERENCES anlama_oturumlari(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, oturum_id)
);

-- 3. Topluluk Çatallamaları (Fork Tablosu)
CREATE TABLE IF NOT EXISTS topluluk_catallamalari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kaynak_oturum_id UUID NOT NULL REFERENCES anlama_oturumlari(id) ON DELETE CASCADE,
    yeni_oturum_id UUID NOT NULL REFERENCES anlama_oturumlari(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Makaleler & Editoryal Araştırmalar
CREATE TABLE IF NOT EXISTS makaleler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(128) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(128) NOT NULL,
    date DATE NOT NULL,
    summary TEXT NOT NULL,
    content_md TEXT NOT NULL,
    primary_concepts TEXT[] DEFAULT '{}',
    related_surahs INT[] DEFAULT '{}',
    reading_time_minutes INT DEFAULT 5,
    reference_score INT DEFAULT 85,
    is_verified BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. İndeksler
CREATE INDEX IF NOT EXISTS idx_anlama_public ON anlama_oturumlari (is_public);
CREATE INDEX IF NOT EXISTS idx_anlama_likes ON anlama_oturumlari (like_count DESC);
CREATE INDEX IF NOT EXISTS idx_anlama_forks ON anlama_oturumlari (fork_count DESC);
CREATE INDEX IF NOT EXISTS idx_makaleler_slug ON makaleler (slug);

-- 6. Mevcut ve Yeni Oturumları Topluluk Havuzuna Seed Etme
UPDATE anlama_oturumlari
SET is_public = true, like_count = 18, fork_count = 6
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE anlama_oturumlari
SET is_public = true, like_count = 12, fork_count = 3
WHERE id = '22222222-2222-2222-2222-222222222222';

INSERT INTO anlama_oturumlari (id, kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, is_public, like_count, fork_count)
VALUES
(
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000001',
    'Adalet ve ihsan terazisi',
    ARRAY['adalet', 'ihsan', 'hikmet'],
    'Kur''an''da adalet (denge ve hak teslimi) ile ihsan (güzellikle muamele ve lütuf) ayrılmaz bir ahlaki bütün oluşturur. Nahl 90''da emredilen adalet ve ihsan birlikteliği, toplumsal düzenin ve bireysel vicdanın asgari ve azami ölçülerini belirler.',
    ARRAY[1, 7],
    'tamamlandi',
    true,
    27,
    9
)
ON CONFLICT (id) DO UPDATE SET
    baslik = EXCLUDED.baslik,
    odak_kavramlar = EXCLUDED.odak_kavramlar,
    sentez_ozeti = EXCLUDED.sentez_ozeti,
    onerilen_okuma_sirasi = EXCLUDED.onerilen_okuma_sirasi,
    durum = EXCLUDED.durum,
    is_public = EXCLUDED.is_public,
    like_count = EXCLUDED.like_count,
    fork_count = EXCLUDED.fork_count;

-- 7. Editoryal Makaleleri Seed Etme
INSERT INTO makaleler (slug, title, author, date, summary, content_md, primary_concepts, related_surahs, reading_time_minutes, reference_score, is_verified)
VALUES
(
    'kuran-ezberi',
    'Kur''an''ı Ezberleme: Farz-ı Ayn mı, Farz-ı Kifaye mi?',
    'Editöryal Ekip',
    '2026-09-06',
    'Hafızlığın Kur''an''da doğrudan bir emir olmadığı, fıkhî statüsünün farz-ı kifaye olduğu ve 30 cüz sisteminin vahiy değil beşeri bir kolaylaştırma yöntemi olduğu analizi.',
    '# Kur''an''ı Ezberleme: Farz-ı Ayn mı, Farz-ı Kifaye mi?

## Kur''ansal Bir Emir mi, İçtihadî Bir Gelenek mi?

Kur''an-ı Kerim''in tamamını ezberlemek (hafızlık), doğrudan Kur''an''sal (ilahi) bir emir değildir; fıkhî statüsüyle "Farz-ı Kifaye" olan içtihadî/tarihî bir zorunluluk ve gelenektir.

* **Kur''an''sal Emir Boyutu:** Kur''an, Müslümanlara bütünüyle hafız olmayı emretmez. Namaz ibadetini yerine getirebilecek kadar küçük bir kısmını ezberden bilmek "Farz-ı Ayn" kabul edilir. Müzzemmil 73:20 ayetinde geçen "Kur''an''dan kolayınıza geleni okuyun" ifadesi buna delil gösterilir.
* **İçtihadî ve Koruma Boyutu:** Kur''an''ın tamamını ezberlemek ise fıkıhta Farz-ı Kifaye sayılır. Bu durum Kur''an''ın tarihsel süreçte tahrif edilmesini önlemek ve sözlü aktarımı güvenceye almak için geliştirilmiş içtihadî bir tedbirdir.
* **Cüz Sistemi:** Cüz ayrımı vahiy dönemine ait değildir. Metin Ramazan ayında 30 günde veya teravih namazlarında eşit paylaştırarak okumayı kolaylaştırmak amacıyla sonradan 30 eşit parçaya bölünmüştür.',
    ARRAY['hafizlik', 'farz-i-kifaye', 'farz-i-ayn', 'cuz-sistemi'],
    ARRAY[73],
    5,
    92,
    true
),
(
    'kuran-ayet-siralamasi',
    'Kur’an Ayet Sıralaması: Mushaf Sırası ve Nüzul Sırası',
    'Editöryal Ekip',
    '2026-09-05',
    'Mushaf’ın tevfîkî (ilahi) sıralaması ile nüzul (iniş) kronolojisi arasındaki fark, Esbâb-ı Nüzûl kaynaklarının güvenilirlik katmanları ve iniş sırası bilgisinin günümüze nasıl ulaştığı üzerine bir analiz.',
    '# Kur’an Ayet Sıralaması: Mushaf Sırası ve Nüzul Sırası

Kur’an-ı Kerim’in bugünkü sıralaması (Mushaf sırası), indiriliş (nüzul) sırasına göre değil, Hz. Peygamber’e Cebrail aracılığıyla bildirilen ilahi bir düzene (tevfiki) göre yapılmıştır.

## İniş Sırası ve Mushaf Sırası Arasındaki Fark

* **Nüzul Sırası:** Kur''an ayetleri 23 yıl boyunca olaylara, ihtiyaçlara ve sorulara göre parça parça inmiştir. Alak 96:1-5 ilk inen vahiydir.
* **Mushaf Sırası:** Fatiha 1:1''den Nas 114:6''ya kadar olan sıralama kronolojik değil, bütünsel edebi ve teolojik mesajı tamamlayan ilahi bir tertiptir.',
    ARRAY['nuzul-sirasi', 'mushaf-sirasi', 'esbab-i-nuzul', 'mekki-medeni'],
    ARRAY[96, 1],
    9,
    95,
    true
)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    author = EXCLUDED.author,
    date = EXCLUDED.date,
    summary = EXCLUDED.summary,
    content_md = EXCLUDED.content_md,
    primary_concepts = EXCLUDED.primary_concepts,
    related_surahs = EXCLUDED.related_surahs,
    reading_time_minutes = EXCLUDED.reading_time_minutes,
    reference_score = EXCLUDED.reference_score,
    is_verified = EXCLUDED.is_verified;

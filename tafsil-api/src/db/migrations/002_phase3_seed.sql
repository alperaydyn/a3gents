-- ══════════════════════════════════════════════════════════════════════
-- tafsil.net — Migration 002: Phase 3 Seed Data
-- Çekirdek Kavramlar, DAG İlişkileri, Kökler ve Anlama Çalışmaları
-- ══════════════════════════════════════════════════════════════════════

-- 1. Morfolojik Kökler (Foundational Roots)
INSERT INTO kokler (id, kok_ar, kok_tr, kok_anlami) VALUES
(1, 'ع-ل-ق', 'alak', 'Tutunmak, asılmak, bağlanmak; yapışkan ve bağlı nesne'),
(2, 'ع-ل-م', 'ilm', 'Bilmek, kavramak, hakikatin idrakine varmak, işaret ve alâmet'),
(3, 'ح-ك-م', 'hkm', 'Hükmetmek, muhkem kılmak, hikmetle hareket etmek, ifsatı engellemek'),
(4, 'و-ق-ي', 'vqy', 'Korumak, sakınmak, sorumluluk bilinciyle perdelenmek (takva)'),
(5, 'أ-م-ن', 'emn', 'Güven içinde olmak, emin kılmak, tasdik etmek (iman)'),
(6, 'ص-ل-ح', 'slh', 'Düzeltmek, barış içinde olmak, uygun ve hayırlı davranmak (amel-i salih)'),
(7, 'ح-س-ن', 'hsn', 'Güzelleştirmek, ihsan etmek, en güzel sûrette yapmak'),
(8, 'ع-د-ل', 'adl', 'Dengelemek, eşit kılmak, adaletle davranmak, istikamet'),
(9, 'ظ-ل-م', 'zlm', 'Bir şeyi yerinden etmek, haddi aşmak, karanlıkta bırakmak (zulüm)'),
(10, 'ه-د-ي', 'hdy', 'Yol göstermek, kılavuzlamak, doğru istikamete iletmek (hidayet)'),
(11, 'ض-ل-ل', 'dll', 'Yoldan sapmak, gayeyi kaybetmek (dalalet)'),
(12, 'ر-ح-م', 'rhm', 'Esirgemek, koruyup gözetmek, merhamet ve şefkat göstermek'),
(13, 'ن-ف-ق', 'nfq', 'Tünel açmak, geçip gitmek, tükenmek; Allah yolunda harcamak (infak)'),
(14, 'ص-ب-ر', 'sbr', 'Kendini tutmak, metanet göstermek, zorluklara karşı direnç (sabır)'),
(15, 'ش-ك-ر', 'skr', 'Nimetin hakkını teslim etmek, minnet duymak ve mukabelede bulunmak (şükür)')
ON CONFLICT (kok_ar) DO UPDATE SET
    kok_tr = EXCLUDED.kok_tr,
    kok_anlami = EXCLUDED.kok_anlami;

SELECT setval('kokler_id_seq', (SELECT MAX(id) FROM kokler));

-- 2. Çekirdek Kur'an Kavramları (Semantik Kavram Ağı)
INSERT INTO kavramlar (id, slug, baslik_tr, baslik_ar, tanim, onaylandi) VALUES
(1, 'ilim', 'İlim', 'العلم', 'Hakikatin delillere dayalı kesin idraki; bilginin bir mülk değil Allah tarafından ihsan edilen bir emanet olarak kavranması.', true),
(2, 'hikmet', 'Hikmet', 'الحكمة', 'Bilgiyi doğru yerde, doğru zamanda ve gaye-i fıtrata uygun biçimde amel ile bütünleştirme basireti.', true),
(3, 'takva', 'Takva', 'التقوى', 'Kişinin yaratıcısına karşı sorumluluk bilinci kuşanarak kendini manevi ve ahlaki yıkımlardan koruması.', true),
(4, 'iman', 'İman', 'الإيمان', 'Kalbin sarsılmaz güven ve teslimiyeti; delille gelen hakikati özgür iradeyle tasdik edip emin olma hali.', true),
(5, 'amel-i-salih', 'Amel-i Salih', 'العمل الصالح', 'Bozulanı onaran, adaleti ikame eden ve insanlığa fayda üreten yapıcı ve ihlaslı eylemler bütünü.', true),
(6, 'ihsan', 'İhsan', 'الإحسان', 'Bir işi en güzel ve eksiksiz biçimde yapmak; Allah''ı görüyormuşçasına derin bir şuur ve lütufkarlıkla yaşamak.', true),
(7, 'adalet', 'Adalet', 'العدل', 'Her hak sahibine hakkını vermek; mizanı korumak ve her türlü ifrat ile tefritten sakınarak istikameti tutturmak.', true),
(8, 'zulum', 'Zulüm', 'الظلم', 'Bir şeyi kendine ait olmayan yere koymak; haddi aşarak haksızlık etmek ve varlığın düzenini ifsat etmek.', true),
(9, 'hidayet', 'Hidayet', 'الهداية', 'İlahi rehberliğin kalbe ve akla yol göstermesi; insanın doğru istikameti bulup orada sebat etmesi.', true),
(10, 'dalalet', 'Dalalet', 'الضلال', 'Hakikat çizgisinden ve istikametten sapma; gayeyi ve pusulayı kaybederek bocalamak.', true),
(11, 'rahmet', 'Rahmet', 'الرحمة', 'Kuşatıcı şefkat, lütuf ve esirgeme; varlığın yaratılış ve sürdürülüşündeki ilahi sevgi ve cömertlik.', true),
(12, 'infak', 'İnfak', 'الإنفاق', 'Sahip olunan nimet ve ilmi Allah rızası ve kardeşlik hukuku adına karşılıksız paylaşıp cömertçe dağıtmak.', true),
(13, 'sabir', 'Sabır', 'الصبر', 'Hakkın ve doğrunun yolunda metanet göstermek, nefsi hevasından alıkoyarak zorluklara göğüs germek.', true),
(14, 'sukur', 'Şükür', 'الشكر', 'Nimetin kaynağını bilip gereğince amel ederek minnettarlığı hem dille hem eylemle ortaya koymak.', true)
ON CONFLICT (slug) DO UPDATE SET
    baslik_tr = EXCLUDED.baslik_tr,
    baslik_ar = EXCLUDED.baslik_ar,
    tanim = EXCLUDED.tanim,
    onaylandi = EXCLUDED.onaylandi;

SELECT setval('kavramlar_id_seq', (SELECT MAX(id) FROM kavramlar));

-- 3. Kavram İlişkileri (Yönlü Çevrimsiz Graf - DAG)
-- İlişki Tipleri: 'es_anlam', 'zit_anlam', 'kapsama', 'sebep_sonuc', 'iliskili'
INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik) VALUES
-- İlim ağının komşuları
(1, 2, 'kapsama', 0.95),      -- İlim -> Hikmet (Hikmet ilmi kapsar/tamamlar)
(1, 4, 'sebep_sonuc', 0.90),  -- İlim -> İman (Tahkiki ilim imana götürür)
(1, 12, 'sebep_sonuc', 0.85), -- İlim -> İnfak (İlim öğretmeyi ve paylaşmayı doğurur)
(1, 3, 'iliskili', 0.88),     -- İlim <-> Takva (Kulları içinde Allah'tan ancak âlimler haşyet duyar)
(1, 6, 'iliskili', 0.80),     -- İlim <-> İhsan (İlim amelde ihsana ulaştırır)

-- Hikmet komşuları
(2, 7, 'sebep_sonuc', 0.92),  -- Hikmet -> Adalet
(2, 5, 'kapsama', 0.87),      -- Hikmet -> Amel-i Salih

-- İman komşuları
(4, 5, 'sebep_sonuc', 0.98),  -- İman -> Amel-i Salih (Ayrılmaz ikili)
(4, 3, 'kapsama', 0.90),      -- İman -> Takva
(4, 10, 'zit_anlam', 1.00),   -- İman <-> Dalalet

-- Adalet & Zulüm
(7, 8, 'zit_anlam', 1.00),    -- Adalet <-> Zulüm
(7, 6, 'kapsama', 0.85),      -- Adalet -> İhsan

-- Hidayet & Dalalet
(9, 10, 'zit_anlam', 1.00),   -- Hidayet <-> Dalalet
(9, 1, 'sebep_sonuc', 0.85),  -- Hidayet -> İlim
(11, 9, 'sebep_sonuc', 0.90), -- Rahmet -> Hidayet

-- İnfak, Cömertlik & Rahmet
(12, 11, 'iliskili', 0.88),   -- İnfak <-> Rahmet
(12, 6, 'kapsama', 0.84),     -- İnfak -> İhsan

-- Sabır & Şükür
(13, 14, 'iliskili', 0.95),   -- Sabır <-> Şükür (İmanın iki yarısı)
(13, 3, 'sebep_sonuc', 0.86), -- Sabır -> Takva
(14, 11, 'sebep_sonuc', 0.90) -- Şükür -> Rahmet
ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO UPDATE SET
    agirlik = EXCLUDED.agirlik;

-- 4. Alak ve Fatiha Seçili Kelimeleri (Word Morphology & Karaoke Timestamps)
-- Alak suresi id=96, ayetler Alak 1..5
DO $$
DECLARE
    v_alak_1_id INT;
    v_alak_2_id INT;
    v_fatiha_1_id INT;
    v_fatiha_2_id INT;
BEGIN
    SELECT id INTO v_alak_1_id FROM ayetler WHERE sure_id = 96 AND ayet_no = 1;
    SELECT id INTO v_alak_2_id FROM ayetler WHERE sure_id = 96 AND ayet_no = 2;
    SELECT id INTO v_fatiha_1_id FROM ayetler WHERE sure_id = 1 AND ayet_no = 1;
    SELECT id INTO v_fatiha_2_id FROM ayetler WHERE sure_id = 1 AND ayet_no = 2;

    IF v_alak_2_id IS NOT NULL THEN
        -- Alak 96:2 (Halaka'l-insâne min alak)
        INSERT INTO kelimeler (ayet_id, kelime_no, metin_ar, metin_tr, kok_id, vezin, start_ms, end_ms)
        VALUES
        (v_alak_2_id, 1, 'خَلَقَ', 'Yarattı', NULL, 'fa''ala', 0, 480),
        (v_alak_2_id, 2, 'ٱلْإِنسَٰنَ', 'İnsanı', NULL, 'if''âl', 480, 1100),
        (v_alak_2_id, 3, 'مِنْ', 'den', NULL, 'harf', 1100, 1350),
        (v_alak_2_id, 4, 'عَلَقٍ', 'alak (asılıp tutunan bir şeyden)', 1, 'fa''al (isim, nekre)', 1350, 2100)
        ON CONFLICT (ayet_id, kelime_no) DO UPDATE SET
            metin_ar = EXCLUDED.metin_ar,
            metin_tr = EXCLUDED.metin_tr,
            kok_id = EXCLUDED.kok_id,
            vezin = EXCLUDED.vezin,
            start_ms = EXCLUDED.start_ms,
            end_ms = EXCLUDED.end_ms;
    END IF;

    IF v_fatiha_1_id IS NOT NULL THEN
        -- Fatiha 1:1 (Bismi'llâhi'r-rahmâni'r-rahîm)
        INSERT INTO kelimeler (ayet_id, kelime_no, metin_ar, metin_tr, kok_id, vezin, start_ms, end_ms)
        VALUES
        (v_fatiha_1_id, 1, 'بِسْمِ', 'İsmiyle', NULL, 'harf + isim', 0, 600),
        (v_fatiha_1_id, 2, 'ٱللَّهِ', 'Allah''ın', NULL, 'alem', 600, 1250),
        (v_fatiha_1_id, 3, 'ٱلرَّحْمَٰنِ', 'Rahmân', 12, 'fa''lân', 1250, 2150),
        (v_fatiha_1_id, 4, 'ٱلرَّحِيمِ', 'Rahîm', 12, 'fa''îl', 2150, 3100)
        ON CONFLICT (ayet_id, kelime_no) DO UPDATE SET
            metin_ar = EXCLUDED.metin_ar,
            metin_tr = EXCLUDED.metin_tr,
            kok_id = EXCLUDED.kok_id,
            vezin = EXCLUDED.vezin,
            start_ms = EXCLUDED.start_ms,
            end_ms = EXCLUDED.end_ms;
    END IF;
END $$;

-- 5. Hazır Sistem Detay Oturumları (Curated Understanding Studies)
-- Bir kullanıcı olmasa bile sistemde global görülebilecek örnek şablon oturum
INSERT INTO kullanicilar (id, auth_provider, auth_provider_id, tercih_modu, is_premium)
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'system-curator', 'ogrenme', true)
ON CONFLICT (auth_provider_id) DO NOTHING;

INSERT INTO anlama_oturumlari (id, kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum)
VALUES
(
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'İlim ve cömertlik',
    ARRAY['ilim', 'infak', 'rahmet'],
    'Kur''an öğretmeyi bir cömertlik fiili olarak kuruyor: Alak''ta “Rabbin en cömert olandır” cümlesinin hemen ardından kalemle öğretmekten söz edilir. Bilgi, sahip olunan bir mülk değil, verilen bir ikramdır. Aynı bağ Rahman''da tekrar kurulur; Bakara''da isimlerin öğretilmesi bu ikramın ilk örneğidir.',
    ARRAY[1, 2, 3, 4, 5],
    'tamamlandi'
),
(
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000001',
    'Sabır ve şükür dengesi',
    ARRAY['sabir', 'sukur', 'takva'],
    'Kur''an''da sabır ile şükür, müminin karşılaştığı lütuf ve imtihan süreçlerindeki iki temel dayanak olarak yan yana zikredilir. Sabır, nefsi heva ve ümitsizlikten korurken; şükür, nimeti var edene bağlayarak tuğyandan alıkoyar.',
    ARRAY[6, 7],
    'tamamlandi'
)
ON CONFLICT (id) DO UPDATE SET
    baslik = EXCLUDED.baslik,
    odak_kavramlar = EXCLUDED.odak_kavramlar,
    sentez_ozeti = EXCLUDED.sentez_ozeti,
    onerilen_okuma_sirasi = EXCLUDED.onerilen_okuma_sirasi,
    durum = EXCLUDED.durum;

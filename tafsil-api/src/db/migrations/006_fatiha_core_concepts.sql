-- ══════════════════════════════════════════════════════════════════════
-- tafsil.net — Migration 006: Fatiha Core Concepts & Semantic Links
-- Fatiha Suresi Çekirdek Kavramları, Kökleri ve Ayet Bağlamları
-- ══════════════════════════════════════════════════════════════════════

-- 1. Morfolojik Kökler
INSERT INTO kokler (kok_ar, kok_tr, kok_anlami) VALUES
('ح-م-د', 'hmd', 'Övmek, hakkını teslim etmek, minnet duymak, kemalatı itiraf etmek'),
('ر-ب-ب', 'rbb', 'Sahiplenmek, tedricen terbiye edip olgunlaştırmak, koruyup gözetmek'),
('ع-ب-د', 'abd', 'Boyun eğmek, kulluk etmek, teslim olmak, ibadetle yönelmek'),
('ن-ع-م', 'nam', 'İyilik, lütuf, refah, hoşa giden ilahi bağış'),
('ص-ر-ط', 'srt', 'Açık, geniş ve dosdoğru cadde/yol')
ON CONFLICT (kok_ar) DO UPDATE SET
    kok_tr = EXCLUDED.kok_tr,
    kok_anlami = EXCLUDED.kok_anlami;

-- 2. Çekirdek Kavramlar
INSERT INTO kavramlar (slug, baslik_tr, baslik_ar, tanim, onaylandi) VALUES
('hamd', 'Hamd', 'الحمد', 'Övgü ve şükrün ötesinde; bir varlığın kendi öz niteliğiyle ortaya koyduğu mükemmelliği takdir etmek. Kur''an bu kavramla başlar ve tüm evrendeki nizamın övgüsünü Allah''a has kılar.', true),
('rabb', 'Rabb', 'الرب', 'Yarattığı varlığı kendi haline bırakmayıp adım adım terbiye eden, koruyan, besleyen ve kemale erdiren mutlak sahip.', true),
('ibadet', 'İbadet', 'العبادة', 'İnsanın yalnız yaratıcısına boyun eğerek özgürleşmesi; varoluşsal kulluk bilinci ve tevhidin amele dönüşmesi.', true),
('nimet', 'Nimet', 'النعمة', 'Kulun kendi gücüyle elde edemeyeceği, tamamen ilahi lütuf ve ihsan olarak bağışlanan maddi ve manevi güzellikler.', true),
('sirat-i-mustakim', 'Sırat-ı Müstakim', 'الصراط المستقيم', 'Her türlü aşırılıktan ve sapmadan uzak, vahyin ve fıtratın rehberliğindeki dosdoğru istikamet çizgisi.', true)
ON CONFLICT (slug) DO UPDATE SET
    baslik_tr = EXCLUDED.baslik_tr,
    baslik_ar = EXCLUDED.baslik_ar,
    tanim = EXCLUDED.tanim,
    onaylandi = EXCLUDED.onaylandi;

-- 3. Kavram İlişkileri (DAG)
DO $$
DECLARE
    v_hamd_id INT;
    v_rabb_id INT;
    v_ibadet_id INT;
    v_nimet_id INT;
    v_sirat_id INT;
    v_sukur_id INT;
    v_rahmet_id INT;
    v_iman_id INT;
    v_takva_id INT;
    v_hidayet_id INT;
    v_dalalet_id INT;
BEGIN
    SELECT id INTO v_hamd_id FROM kavramlar WHERE slug = 'hamd';
    SELECT id INTO v_rabb_id FROM kavramlar WHERE slug = 'rabb';
    SELECT id INTO v_ibadet_id FROM kavramlar WHERE slug = 'ibadet';
    SELECT id INTO v_nimet_id FROM kavramlar WHERE slug = 'nimet';
    SELECT id INTO v_sirat_id FROM kavramlar WHERE slug = 'sirat-i-mustakim';
    SELECT id INTO v_sukur_id FROM kavramlar WHERE slug = 'sukur';
    SELECT id INTO v_rahmet_id FROM kavramlar WHERE slug = 'rahmet';
    SELECT id INTO v_iman_id FROM kavramlar WHERE slug = 'iman';
    SELECT id INTO v_takva_id FROM kavramlar WHERE slug = 'takva';
    SELECT id INTO v_hidayet_id FROM kavramlar WHERE slug = 'hidayet';
    SELECT id INTO v_dalalet_id FROM kavramlar WHERE slug = 'dalalet';

    -- Hamd <-> Şükür & Rahmet
    IF v_hamd_id IS NOT NULL AND v_sukur_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_hamd_id, v_sukur_id, 'kapsama', 0.95)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    IF v_hamd_id IS NOT NULL AND v_rahmet_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_hamd_id, v_rahmet_id, 'iliskili', 0.90)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    -- Rabb <-> Rahmet
    IF v_rabb_id IS NOT NULL AND v_rahmet_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_rabb_id, v_rahmet_id, 'iliskili', 0.92)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    -- İbadet -> İman & Takva
    IF v_ibadet_id IS NOT NULL AND v_iman_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_ibadet_id, v_iman_id, 'sebep_sonuc', 0.94)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    IF v_ibadet_id IS NOT NULL AND v_takva_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_ibadet_id, v_takva_id, 'sebep_sonuc', 0.88)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    -- Nimet -> Şükür
    IF v_nimet_id IS NOT NULL AND v_sukur_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_nimet_id, v_sukur_id, 'sebep_sonuc', 0.96)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    -- Sırat-ı Müstakim <-> Hidayet & Dalalet
    IF v_sirat_id IS NOT NULL AND v_hidayet_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_sirat_id, v_hidayet_id, 'es_anlam', 0.98)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;

    IF v_sirat_id IS NOT NULL AND v_dalalet_id IS NOT NULL THEN
        INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
        VALUES (v_sirat_id, v_dalalet_id, 'zit_anlam', 1.00)
        ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO NOTHING;
    END IF;
END $$;

-- 4. Fatiha Suresi Ayet Meallerini [Kavram|slug] Etiketleriyle Zenginleştirme
UPDATE ayetler SET meal_tr = '[Rahmân|rahmet] ve [Rahîm|rahmet] olan Allah''ın adıyla.' WHERE sure_id = 1 AND ayet_no = 1;
UPDATE ayetler SET meal_tr = '[Hamd|hamd], âlemlerin [Rabbi|rabb] Allah''a mahsustur.' WHERE sure_id = 1 AND ayet_no = 2;
UPDATE ayetler SET meal_tr = 'O, [Rahmândır|rahmet], [Rahîmdir|rahmet].' WHERE sure_id = 1 AND ayet_no = 3;
UPDATE ayetler SET meal_tr = 'Din gününün sahibidir.' WHERE sure_id = 1 AND ayet_no = 4;
UPDATE ayetler SET meal_tr = 'Yalnız sana [ibadet|ibadet] eder, yalnız senden yardım dileriz.' WHERE sure_id = 1 AND ayet_no = 5;
UPDATE ayetler SET meal_tr = 'Bizi [doğru yola|sirat-i-mustakim] ilet;' WHERE sure_id = 1 AND ayet_no = 6;
UPDATE ayetler SET meal_tr = 'Kendilerine [nimet|nimet] verdiklerinin yoluna; gazaba uğrayanların ve [sapıtanlarınkine|dalalet] değil.' WHERE sure_id = 1 AND ayet_no = 7;

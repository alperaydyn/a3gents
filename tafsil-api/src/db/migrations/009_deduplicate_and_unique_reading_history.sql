-- ==============================================================================
-- tafsil.net — Phase 7: Okuma ve Kavram Geçmişi Tekilleştirme & Idempotency Koruması
-- ==============================================================================

-- 1. Okuma Geçmişindeki Mükerrer Kayıtları Temizle
DELETE FROM okuma_gecmisi a
USING okuma_gecmisi b
WHERE a.ctid < b.ctid
  AND a.kullanici_id = b.kullanici_id
  AND a.sure_id = b.sure_id
  AND a.ayet_no = b.ayet_no
  AND a.okundu_tarihi = b.okundu_tarihi;

-- 2. Okuma Geçmişi Tekillik İndeksi (Kullanıcı + Sure + Ayet + Timestamp)
CREATE UNIQUE INDEX IF NOT EXISTS uq_okuma_gecmisi_user_verse_date 
ON okuma_gecmisi (kullanici_id, sure_id, ayet_no, okundu_tarihi);

-- 3. Kavram Geçmişindeki Mükerrer Kayıtları Temizle
DELETE FROM kavram_gecmisi a
USING kavram_gecmisi b
WHERE a.ctid < b.ctid
  AND a.kullanici_id = b.kullanici_id
  AND a.kavram_slug = b.kavram_slug
  AND a.created_at = b.created_at;

-- 4. Kavram Geçmişi Tekillik İndeksi (Kullanıcı + Kavram + Timestamp)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kavram_gecmisi_user_slug_date 
ON kavram_gecmisi (kullanici_id, kavram_slug, created_at);

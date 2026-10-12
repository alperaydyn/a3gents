-- ==============================================================================
-- tafsil.net — PBI-10.3: İstemci Tanılama Raporları & Veri Hareketi Kayıtları
-- ==============================================================================
-- Mobil "Veri Akışı & Tanılama" ekranının sunucu karşılığı. Kullanıcı bir sorun
-- yaşadığında paylaştığı tanılama raporu burada saklanır; destek ekibi e-postadaki
-- kısa kod (ör. TD-7K2M9Q) ile raporu bulur.
--
-- Gizlilik: Rapor JWT, e-posta, yer imi notu veya okuma içeriği İÇERMEZ (istemci tarafı
-- filtreler). Kimlik yalnızca doğrulanmış JWT'den alınır; misafir raporları anonimdir.
-- Saklama: 90 günden eski raporlar periyodik olarak silinebilir (bkz. alttaki not).
-- Bu migration idempotenttir (migrate.ts tüm dosyaları her çalıştırmada uygular).
-- ==============================================================================

-- 1. Rapor başlığı (rapor başına tek satır; özet alanlar sorgulanabilir kolonlarda)
CREATE TABLE IF NOT EXISTS istemci_tanilama_raporlari (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kisa_kod                VARCHAR(16) NOT NULL UNIQUE,
    kullanici_id            UUID REFERENCES kullanicilar(id) ON DELETE SET NULL,
    kurulum_id              VARCHAR(64),
    rapor_surumu            SMALLINT NOT NULL DEFAULT 1,

    -- Cihaz & uygulama
    platform                VARCHAR(16),
    os_surumu               VARCHAR(32),
    cihaz                   VARCHAR(64),
    uygulama_surumu         VARCHAR(32),
    build_no                VARCHAR(32),
    calisma_modu            VARCHAR(8),          -- dev | release
    api_adresi              VARCHAR(255),

    -- Bağlantı & senkron özeti
    baglanti_durumu         VARCHAR(20),         -- online | offline | api_unreachable | unknown
    ag_tipi                 VARCHAR(24),
    api_gecikme_ms          INTEGER,
    son_senkron_basarili    BOOLEAN,
    son_senkron_zamani      TIMESTAMPTZ,
    oturum_suresi_doldu     BOOLEAN DEFAULT false,

    -- Yerel depolama özeti (bayt)
    toplam_yerel_bayt       BIGINT,
    kv_bayt                 BIGINT,
    sqlite_bayt             BIGINT,
    ses_bayt                BIGINT,

    -- Yerel ↔ sunucu karşılaştırması (rapor anındaki sayılar)
    yerel_okuma_sayisi      INTEGER,
    sunucu_okuma_sayisi     INTEGER,

    kullanici_notu          TEXT,
    katman_sayaclari        JSONB NOT NULL DEFAULT '{}'::jsonb,
    depolama_envanteri      JSONB NOT NULL DEFAULT '{}'::jsonb,
    baglanti                JSONB NOT NULL DEFAULT '{}'::jsonb,
    son_senkron             JSONB,
    sunucu_durumu           JSONB,
    olay_sayisi             INTEGER NOT NULL DEFAULT 0,

    durum                   VARCHAR(16) NOT NULL DEFAULT 'yeni',   -- yeni | inceleniyor | cozuldu
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tanilama_kullanici
    ON istemci_tanilama_raporlari (kullanici_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tanilama_created
    ON istemci_tanilama_raporlari (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tanilama_durum
    ON istemci_tanilama_raporlari (durum, created_at DESC);

-- 2. Veri hareketleri (rapordaki olay akışı; katman bazlı analiz için satır satır)
CREATE TABLE IF NOT EXISTS istemci_veri_hareketleri (
    id              BIGSERIAL PRIMARY KEY,
    rapor_id        UUID NOT NULL REFERENCES istemci_tanilama_raporlari(id) ON DELETE CASCADE,
    kullanici_id    UUID REFERENCES kullanicilar(id) ON DELETE SET NULL,
    olay_zamani     TIMESTAMPTZ NOT NULL,
    katman          VARCHAR(16) NOT NULL,   -- L1_ZUSTAND | L2_KV | L3_SQLITE | L4_SNAPSHOT | L5_FILE | NET_API | NET_CDN | NET_EXT | SYS
    islem           VARCHAR(12) NOT NULL,   -- read | write | delete | hit | miss | fallback | request | push | pull | download | state
    anahtar         VARCHAR(200),
    durum           VARCHAR(8) NOT NULL DEFAULT 'ok',   -- ok | miss | error
    bayt            INTEGER,
    sure_ms         INTEGER,
    tekrar          INTEGER NOT NULL DEFAULT 1,
    detay           VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_veri_hareketleri_rapor
    ON istemci_veri_hareketleri (rapor_id, olay_zamani);
CREATE INDEX IF NOT EXISTS idx_veri_hareketleri_katman
    ON istemci_veri_hareketleri (katman, islem, durum);
CREATE INDEX IF NOT EXISTS idx_veri_hareketleri_hata
    ON istemci_veri_hareketleri (olay_zamani DESC) WHERE durum = 'error';

-- Saklama notu (cron / BullMQ ile periyodik çalıştırılabilir):
-- DELETE FROM istemci_tanilama_raporlari WHERE created_at < NOW() - INTERVAL '90 days';

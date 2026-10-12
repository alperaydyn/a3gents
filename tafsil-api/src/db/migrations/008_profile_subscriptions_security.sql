-- 008_profile_subscriptions_security.sql: User Profile, Subscriptions, and Security Schema Extensions

-- 1. Kullanıcılar tablosuna isim, e-posta ve şifre hash sütunları ekleme
ALTER TABLE kullanicilar
ADD COLUMN IF NOT EXISTS name VARCHAR(128),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_kullanicilar_email ON kullanicilar(email);

-- 2. Abonelikler Tablosu (StoreKit 2 / Google Play Billing / Webhook hakikat kaynağı)
CREATE TABLE IF NOT EXISTS abonelikler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    store VARCHAR(16) NOT NULL CHECK (store IN ('apple', 'google', 'stripe')),
    original_transaction_id VARCHAR(128) NOT NULL UNIQUE,
    product_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'canceled', 'expired')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abonelikler_kullanici ON abonelikler(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_abonelikler_status ON abonelikler(status, current_period_end);

-- 3. Şifre Sıfırlama Talepleri Tablosu (Kriptografik Token & TTL)
CREATE TABLE IF NOT EXISTS sifre_sifirlama_talepleri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kullanici_id UUID NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sifre_sifirlama_token ON sifre_sifirlama_talepleri(token_hash);

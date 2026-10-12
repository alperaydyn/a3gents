# tafsil.net — Backend API & AI Services

Fastify (Node.js v20 LTS) tabanlı yüksek performanslı REST API, PostgreSQL 16+ (pgvector), Redis önbellek ve OpenRouter Agentic RAG servisleri.

---

## 1. Veritabanı ve Bağlantı Mimarisi

Sistemde iki farklı veritabanı bağlantı adresi tanımlıdır:

- **`DATABASE_URL` (Port 6432):** Fastify API çalışma zamanında yüksek eşzamanlı sorgular için PgBouncer (Transaction Pooling) üzerinden bağlanır.
- **`DATABASE_URL_DIRECT` (Port 5432):** DDL migration'ları (`npm run db:migrate`), şema değişiklikleri ve toplu veri yükleme (`npm run db:seed`) için doğrudan PostgreSQL'e bağlanır.

> **Bağlantı Havuzu (Lazy Loading):** `src/db/client.ts` içerisindeki çalışma zamanı havuzu (`pool`) lazy olarak başlatılır; bu sayede migration veya seed betikleri PgBouncer henüz ayakta olmasa bile doğrudan 5432 portu üzerinden hatasız çalışır.

---

## 2. Geliştirme Ortamı & VPS Veritabanına Erişim (SSH Tüneli)

VPS üzerindeki veritabanı güvenlik amacıyla dış internete kapalıdır. Kendi yerel makinenizden (`localhost`) VPS veritabanında migration, seed ve geliştirme yapmak için SSH tüneli kullanılır:

```bash
# Mac/Yerel terminalde tüneli başlatın (arka planda açık bırakın):
ssh -N -L 5432:localhost:5432 hostinger
```
*(Not: PgBouncer servisi VPS üzerinde henüz aktif değilse `-L 6432:localhost:6432` parametresini eklemeyiniz; aksi takdirde `Connection refused` uyarısı alırsınız).*

---

## 3. Komutlar

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# Veritabanı şema ve indeks migration'ını çalıştır (DATABASE_URL_DIRECT)
npm run db:migrate

# Kur'an metnini ve sureleri içeri aktar (uthmani.txt)
npm run db:seed

# Veritabanı tablo kayıt sayılarını ve pgvector durumunu kontrol et
npm run db:status

# Prodüksiyon derlemesi
npm run build
```

---

## 4. İlgili Dokümantasyon
- Mimari Şartname: [docs/agents/02-BACKEND-AGENT.md](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/agents/02-BACKEND-AGENT.md)
- Ana Blueprint: [docs/agents/00-MASTER-BLUEPRINT.md](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/agents/00-MASTER-BLUEPRINT.md)
- Deployment Rehberi: [docs/deployment/01-BACKEND-DEPLOY.md](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/deployment/01-BACKEND-DEPLOY.md)

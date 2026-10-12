# tafsil.net — Web Application & Sharing Portal

Next.js ve React tabanlı web okuma arayüzü, dinamik sosyal paylaşım kartı (Open Graph / Story) üreticisi ve derin bağlantı (Deep Link) karşılama kapısı.

## Detaylı Geliştirici & Ajan Kılavuzu
Web uygulaması şartnamesi için bkz:
👉 **[docs/agents/04-WEB-APP-AGENT.md](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/agents/04-WEB-APP-AGENT.md)**
👉 **[docs/agents/00-MASTER-BLUEPRINT.md](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/agents/00-MASTER-BLUEPRINT.md)**

## Temel Özellikler
- Dinamik Derin Bağlantı Karşılama (`/ayet/:sure/:no`, `/kavram/:slug`, `/oturum/:id`)
- Instagram Story (9:16) ve X/WhatsApp (16:9) Otomatik Önizleme Kartı Üreticisi (`/api/og`)
- Topluluk Kavram Havuzu Keşfi ve Çatallama (Fork)
- Geniş Ekran Masaüstü Kur'an Okuma Düzeni

## Faz 1 Durumu (bkz. [docs/agent-signals/agent-04.status.json](file:///Users/alperaydin/Projects/kuran-tafsil-net/docs/agent-signals/agent-04.status.json))

Kuruldu: proje iskeleti, tasarım sistemi (açık/koyu, mobille aynı "ceviz" paleti),
ana sayfa, `/ayet/[sureId]/[ayetNo]` ve `/kavram/[slug]` (gerçek Kur'an metniyle,
backend API hazır olmadan `src/data/*.snapshot.json` üzerinden), `/api/og` kart üretici.

```bash
cd tafsil-web-app
npm install
npm run dev        # http://localhost:3000
npm run snapshot:quran  # data-pipeline kaynaklarından Kur'an anlık görüntüsünü yeniler
```

Backend API (BE-004/BE-006) hazır olduğunda `src/lib/api.ts` içindeki `USE_MOCK`
bayrağı `false` yapılacak — bkz. o dosyanın başlık notu.

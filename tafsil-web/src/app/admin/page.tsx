import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDashboard, listCommunityModeration, listArticles } from "@/lib/api";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Yönetim & Moderasyon Portalı · tafsil",
  description: "tafsil.net operasyonel yönetim, topluluk moderasyonu ve sistem sağlığı konsolu.",
};

export default async function AdminPage() {
  const [stats, communityList, articles] = await Promise.all([
    getAdminDashboard(),
    listCommunityModeration(),
    listArticles(),
  ]);

  const metrics = stats?.metrics || {
    totalUsers: 0,
    totalPublicSessions: 0,
    totalArticles: 0,
    verifiedArticles: 0,
    totalMemorizationRounds: 0,
    modeDistribution: { kesif: 0, ogrenme: 0, odak: 0 },
  };

  const system = stats?.system || {
    nodeEnv: "production",
    uptimeSeconds: 0,
    redisConnected: false,
    dbConnected: false,
    memoryUsageMb: 0,
  };

  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Sistem & Moderasyon Konsolu</span>
          <h1 className={styles.title}>Yönetim Portalı</h1>
          <p className={styles.subtitle}>
            Topluluk tefekkür havuzu moderasyonu, Kur'an referanslı editoryal yayıncılık ve sistem metrikleri.
          </p>

          <div className={styles.actionRow}>
            <Link href="/admin/makale-yaz" className={styles.primaryAction}>
              ✍️ Yeni Makale Yaz & Doğrula
            </Link>
            <Link href="/topluluk" className={styles.primaryAction} style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>
              🌐 Topluluk Havuzunu Aç
            </Link>
          </div>
        </header>

        {/* 1. Canlı KPI Kartları */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Toplam Kullanıcı</div>
            <div className={styles.statValue}>{metrics.totalUsers}</div>
            <div className={styles.statMeta}>
              Keşif: {metrics.modeDistribution.kesif} · Öğrenme: {metrics.modeDistribution.ogrenme} · Odak: {metrics.modeDistribution.odak}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Topluluk Oturumu</div>
            <div className={styles.statValue}>{metrics.totalPublicSessions}</div>
            <div className={styles.statMeta}>Paylaşılan kamuya açık anlama çalışmaları</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Editoryal Makaleler</div>
            <div className={styles.statValue}>{metrics.totalArticles}</div>
            <div className={styles.statMeta}>{metrics.verifiedArticles} onaylı Kur'an referansı</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Sistem Sağlığı</div>
            <div className={styles.statValue} style={{ color: system.dbConnected && system.redisConnected ? "#137333" : "#c5221f" }}>
              {system.dbConnected && system.redisConnected ? "Sağlıklı" : "Uyarı"}
            </div>
            <div className={styles.statMeta}>
              PG: {system.dbConnected ? "✓" : "✕"} · Redis: {system.redisConnected ? "✓" : "✕"} · Bellek: {system.memoryUsageMb} MB
            </div>
          </div>
        </div>

        {/* 2. Topluluk Moderasyonu */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Topluluk Çalışmaları Moderasyonu</h2>
            <span style={{ fontSize: "13px", color: "var(--ink-secondary)" }}>
              {communityList.length} çalışma listeleniyor
            </span>
          </div>

          <div className={styles.moderationList}>
            {communityList.length === 0 ? (
              <p style={{ color: "var(--ink-faint)", fontSize: "14px" }}>Henüz moderasyon bekleyen çalışma yok.</p>
            ) : (
              communityList.map((item) => (
                <div key={item.id} className={styles.moderationCard}>
                  <div className={styles.cardMain}>
                    <Link href={`/oturum/${item.id}`} className={styles.cardTitle}>
                      {item.baslik}
                    </Link>
                    <div className={styles.cardMeta}>
                      <span>{new Date(item.created_at).toLocaleDateString("tr-TR")}</span>
                      <span>❤️ {item.like_count} beğeni</span>
                      <span>🔀 {item.fork_count} çatallama</span>
                    </div>
                  </div>

                  <div className={styles.cardBadges}>
                    {item.is_featured && <span className={styles.featuredBadge}>Öne Çıkan</span>}
                    <span
                      className={`${styles.statusBadge} ${
                        item.moderation_status === "onaylandi"
                          ? styles.statusApproved
                          : styles.statusPending
                      }`}
                    >
                      {item.moderation_status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 3. Editoryal Yayınlar ve Referans Skorları */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Editoryal İçerik Durumu</h2>
            <Link href="/admin/makale-yaz" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>
              + Yeni Ekle
            </Link>
          </div>

          <table className={styles.systemTable}>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Yazar</th>
                <th>Tarih</th>
                <th>Kur'an Referans Skoru</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((art) => (
                <tr key={art.slug}>
                  <td>
                    <Link href={`/makaleler/${art.slug}`} style={{ fontWeight: 500, color: "var(--ink)", textDecoration: "none" }}>
                      {art.title}
                    </Link>
                  </td>
                  <td>{art.author}</td>
                  <td>{art.date}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: art.reference_score >= 85 ? "#137333" : "#b06000" }}>
                      {art.reference_score} / 100
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        art.is_verified ? styles.statusApproved : styles.statusPending
                      }`}
                    >
                      {art.is_verified ? "Doğrulandı" : "Taslak"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

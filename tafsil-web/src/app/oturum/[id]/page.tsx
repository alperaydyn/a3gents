import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnderstandingSession } from "@/lib/api";
import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getUnderstandingSession(id);
  if (!session) {
    return { title: "Oturum Bulunamadı · tafsil" };
  }

  const title = `${session.baslik} · Anlama Çalışması · tafsil`;
  const description = session.sentez_ozeti || "Kur'an kavramları ve ayet rotaları anlama çalışması.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: `/api/og?format=landscape&title=${encodeURIComponent(session.baslik)}&tr=${encodeURIComponent(
            (session.sentez_ozeti || "").slice(0, 140)
          )}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function OturumDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getUnderstandingSession(id);

  if (!session) {
    notFound();
  }

  const appDeepLink = `tafsil://oturum/${session.id}`;

  return (
    <main className={styles.main}>
      <div className="container">
        <div className={styles.breadcrumb}>
          <Link href="/topluluk" className={styles.backLink}>
            ← Topluluk Havuzuna Dön
          </Link>
        </div>

        <header className={styles.header}>
          <span className={styles.badge}>Anlama Çalışması</span>
          <h1 className={styles.title}>{session.baslik}</h1>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            {session.odak_kavramlar.map((c) => (
              <Link
                key={c}
                href={`/kavram/${c}`}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: "var(--surf)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                  textDecoration: "none",
                }}
              >
                #{c}
              </Link>
            ))}
          </div>

          <div className={styles.actions}>
            <a href={appDeepLink} className={styles.btnPrimary}>
              <span>↗</span> tafsil Uygulamasında Aç
            </a>
            <button
              type="button"
              className={styles.btnSecondary}
              style={{ cursor: "pointer" }}
            >
              ♥ {session.like_count} Beğeni
            </button>
            <span style={{ fontSize: 13, color: "var(--mut)" }}>
              ⑂ {session.fork_count} Kez Çatallandı
            </span>
          </div>
        </header>

        {session.sentez_ozeti && (
          <section className={styles.synthesisBox}>
            <div className={styles.synthesisLabel}>Sentez Özeti</div>
            <p className={styles.synthesisText}>“{session.sentez_ozeti}”</p>
          </section>
        )}

        <section>
          <h2 className={styles.sectionTitle}>Önerilen Okuma Rotası</h2>
          {session.onerilen_okuma_sirasi.length === 0 ? (
            <p style={{ color: "var(--mut)" }}>Henüz bir okuma rotası eklenmemiş.</p>
          ) : (
            <div className={styles.queueList}>
              {session.onerilen_okuma_sirasi.map((ayahId, idx) => (
                <div key={ayahId} className={styles.queueItem}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className={styles.queueIndex}>{idx + 1}</span>
                    <div>
                      <div className={styles.queueRef}>Ayet #{ayahId}</div>
                      <div className={styles.queueDesc}>
                        Nüzul kronolojisine göre belirlenen inceleme durağı.
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/ayet/1/${ayahId}`}
                    style={{
                      fontSize: 13,
                      color: "var(--gold)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Ayete Git →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

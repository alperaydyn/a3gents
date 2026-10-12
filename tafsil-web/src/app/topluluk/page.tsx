import type { Metadata } from "next";
import Link from "next/link";
import { listCommunitySessions, getCommunityConcepts, listArticles } from "@/lib/api";
import styles from "./page.module.css";

export const revalidate = 1800; // 30 dk ISR

export const metadata: Metadata = {
  title: "Topluluk Kavram ve Tefekkür Havuzu · tafsil",
  description: "Kur'an kavramları üzerinde kullanıcılar tarafından yürütülen anlama çalışmaları, paylaşılan rotalar ve doğrulanmış editoryal makaleler.",
  openGraph: {
    title: "Topluluk Kavram ve Tefekkür Havuzu · tafsil",
    description: "Kur'an kavramları üzerinde kullanıcılar tarafından yürütülen anlama çalışmaları ve paylaşılan rotalar.",
  },
};

interface PageProps {
  searchParams?: Promise<{ kavram?: string; sort?: string }>;
}

export default async function ToplulukPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const activeKavram = resolvedParams.kavram;
  const activeSort = resolvedParams.sort || "popular";

  const [sessions, concepts, articles] = await Promise.all([
    listCommunitySessions(activeKavram, activeSort),
    getCommunityConcepts(),
    listArticles(),
  ]);

  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Topluluk ve Tefekkür Bahçesi</span>
          <h1 className={styles.title}>Ortak Anlama ve Kavram Havuzu</h1>
          <p className={styles.subtitle}>
            Birlikte inşa edilen kavram rotaları, derinleştirilmiş anlama çalışmaları ve paylaşılan Kur'an tefekkürleri.
          </p>
        </header>

        {concepts.length > 0 && (
          <div className={styles.conceptCloud}>
            <Link
              href="/topluluk"
              className={`${styles.conceptTag} ${!activeKavram ? styles.conceptTagActive : ""}`}
            >
              Tüm Kavramlar
            </Link>
            {concepts.map((c) => (
              <Link
                key={c.slug}
                href={`/topluluk?kavram=${c.slug}`}
                className={`${styles.conceptTag} ${activeKavram === c.slug ? styles.conceptTagActive : ""}`}
              >
                {c.baslik_tr} ({c.session_count})
              </Link>
            ))}
          </div>
        )}

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Paylaşılan Anlama Çalışmaları</h2>
          <span className={styles.sectionCount}>{sessions.length} Çalışma Listelendi</span>
        </div>

        {sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--mut)" }}>
            Bu filtrede henüz paylaşılan bir anlama çalışması bulunmuyor.
          </div>
        ) : (
          <div className={styles.grid}>
            {sessions.map((s) => (
              <Link key={s.id} href={`/oturum/${s.id}`} className={styles.card}>
                <div>
                  <div className={styles.cardTop}>
                    <h3 className={styles.cardTitle}>{s.baslik}</h3>
                  </div>
                  {s.sentez_ozeti && (
                    <p className={styles.cardSummary}>{s.sentez_ozeti}</p>
                  )}
                  <div className={styles.chipList}>
                    {s.odak_kavramlar.map((c) => (
                      <span key={c} className={styles.chip}>#{c}</span>
                    ))}
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.cardStats}>
                    <span>♥ {s.like_count} Beğeni</span>
                    <span>⑂ {s.fork_count} Çatallama</span>
                  </div>
                  <span className={styles.cardAction}>İncele →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {articles.length > 0 && (
          <section style={{ marginTop: 72 }}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Editoryal İncelemeler & Araştırmalar</h2>
              <Link href="/makaleler" className={styles.cardAction}>Tüm Makaleler →</Link>
            </div>
            <div className={styles.grid}>
              {articles.map((art) => (
                <Link key={art.slug} href={`/makaleler/${art.slug}`} className={styles.card}>
                  <div>
                    <div className={styles.cardTop}>
                      <h3 className={styles.cardTitle}>{art.title}</h3>
                    </div>
                    <p className={styles.cardSummary}>{art.summary}</p>
                    <div className={styles.chipList}>
                      {art.primary_concepts.map((c) => (
                        <span key={c} className={styles.chip}>#{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.cardFooter}>
                    <span>Referans Skoru: %{art.reference_score}</span>
                    <span className={styles.cardAction}>Oku →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

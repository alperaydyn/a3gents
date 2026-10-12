import type { Metadata } from "next";
import Link from "next/link";
import { listArticles } from "@/lib/api";
import styles from "./page.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Editoryal Araştırmalar ve Makaleler · tafsil",
  description: "Kur'an ilimleri, nüzul kronolojisi, fıkıh ve kavram tahlilleri üzerine titiz ve akademik editoryal araştırmalar.",
  openGraph: {
    title: "Editoryal Araştırmalar ve Makaleler · tafsil",
    description: "Kur'an ilimleri, nüzul kronolojisi ve kavram tahlilleri araştırmaları.",
  },
};

export default async function MakalelerPage() {
  const articles = await listArticles();

  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>İlmi Güvenilirlik & Araştırma</span>
          <h1 className={styles.title}>Editoryal Makaleler & Tefekkür</h1>
          <p className={styles.subtitle}>
            Uydurma ve zayıf rivayetlerden arındırılmış, doğrudan Kur'an metnini ve nüzul bağlamını merkeze alan araştırmalar.
          </p>
        </header>

        <div className={styles.list}>
          {articles.map((art) => (
            <Link key={art.slug} href={`/makaleler/${art.slug}`} className={styles.articleCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.articleTitle}>{art.title}</h2>
                <span className={styles.scoreBadge}>
                  {art.is_verified ? "✓ " : ""}Referans: %{art.reference_score}
                </span>
              </div>
              <div className={styles.meta}>
                <span>{art.author}</span> · <span>{art.date}</span> · <span>{art.reading_time_minutes} dk okuma</span>
              </div>
              <p className={styles.summary}>{art.summary}</p>
              <div className={styles.footer}>
                <div className={styles.conceptList}>
                  {art.primary_concepts.map((c) => (
                    <span key={c} className={styles.conceptItem}>#{c}</span>
                  ))}
                </div>
                <span style={{ color: "var(--gold)", fontWeight: 500 }}>Yazıyı Oku →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

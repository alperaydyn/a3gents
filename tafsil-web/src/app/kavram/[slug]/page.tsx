import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getKavram } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import styles from "./page.module.css";

export const revalidate = 3600;

interface RouteParams {
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const kavram = await getKavram(slug);
  if (!kavram) return {};

  const ogImage = `${SITE_URL}/api/og?${new URLSearchParams({
    sure: kavram.baslikTr,
    ayet: kavram.baslikAr,
    tr: kavram.tanim,
  }).toString()}`;

  return {
    title: kavram.baslikTr,
    description: kavram.tanim,
    alternates: { canonical: `/kavram/${kavram.slug}` },
    openGraph: {
      title: kavram.baslikTr,
      description: kavram.tanim,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
  };
}

export default async function KavramPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const kavram = await getKavram(slug);
  if (!kavram) notFound();

  return (
    <main className={styles.main}>
      <div className={`container ${styles.inner}`}>
        <nav className={styles.breadcrumb}>
          <Link href="/">tafsil</Link>
          <span>/</span>
          <span>kavram</span>
        </nav>

        <article className={styles.card}>
          <p className="eyebrow">{kavram.kategori.replace(/_/g, " ")}</p>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{kavram.baslikTr}</h1>
            <span className={`arabic ${styles.titleAr}`}>{kavram.baslikAr}</span>
          </div>
          <p className={styles.tanim}>{kavram.tanim}</p>

          <Link
            href={`/ayet/${kavram.ilkGectigiYer.sureId}/${kavram.ilkGectigiYer.ayetNo}`}
            className={styles.firstRef}
          >
            İlk geçtiği yer: {kavram.ilkGectigiYer.sureNameTr}{" "}
            {kavram.ilkGectigiYer.sureId}:{kavram.ilkGectigiYer.ayetNo} →
          </Link>
        </article>

        {kavram.iliskiler.length > 0 ? (
          <section className={styles.related}>
            <p className="eyebrow">İlişkili kavramlar</p>
            <div className={styles.relatedGrid}>
              {kavram.iliskiler.map((r) => (
                <Link key={r.slug} href={`/kavram/${r.slug}`} className={styles.relatedCard}>
                  <span>{r.baslikTr}</span>
                  <span className={styles.relatedTip}>{r.tip.replace(/_/g, " ")}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className={styles.appCta}>
          <p>Kavramın tam ağını ve geçtiği tüm ayetleri görmek için tafsil uygulamasını aç.</p>
        </div>
      </div>
    </main>
  );
}

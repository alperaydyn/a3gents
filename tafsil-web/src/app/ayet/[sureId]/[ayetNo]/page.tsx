import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAyet, getSure } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { InteractiveAyetReader } from "@/components/interactive-reader/InteractiveAyetReader";
import styles from "./page.module.css";


export const revalidate = 86400;

interface RouteParams {
  sureId: string;
  ayetNo: string;
}

function parseParams(params: RouteParams) {
  const sureId = Number(params.sureId);
  const ayetNo = Number(params.ayetNo);
  if (!Number.isInteger(sureId) || !Number.isInteger(ayetNo)) return null;
  return { sureId, ayetNo };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const parsed = parseParams(await params);
  if (!parsed) return {};
  const ayet = await getAyet(parsed.sureId, parsed.ayetNo);
  if (!ayet) return {};

  const title = `${ayet.sureNameTr} ${ayet.sureId}:${ayet.ayetNo}`;
  const description = ayet.mealTr;
  const ogImage = `${SITE_URL}/api/og?${new URLSearchParams({
    sure: ayet.sureNameTr,
    ayet: String(ayet.ayetNo),
    ar: ayet.metinAr,
    tr: ayet.mealTr,
  }).toString()}`;

  return {
    title,
    description,
    alternates: { canonical: `/ayet/${ayet.sureId}/${ayet.ayetNo}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function AyetPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const parsed = parseParams(await params);
  if (!parsed) notFound();

  const [ayet, sure] = await Promise.all([
    getAyet(parsed.sureId, parsed.ayetNo),
    getSure(parsed.sureId),
  ]);
  if (!ayet || !sure) notFound();

  const prevAyet = parsed.ayetNo > 1 ? parsed.ayetNo - 1 : null;
  const nextAyet = parsed.ayetNo < sure.verseCount ? parsed.ayetNo + 1 : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Quotation",
    text: ayet.mealTr,
    isPartOf: {
      "@type": "Book",
      name: sure.nameTr,
    },
    url: `${SITE_URL}/ayet/${ayet.sureId}/${ayet.ayetNo}`,
  };

  return (
    <main className={styles.main}>
      <div className={`container ${styles.inner}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <nav className={styles.breadcrumb}>
          <Link href="/">tafsil</Link>
          <span>/</span>
          <span>
            {sure.nameTr} · {sure.id}:{ayet.ayetNo}
          </span>
        </nav>

        <InteractiveAyetReader
          sureId={sure.id}
          sureNameTr={sure.nameTr}
          ayetNo={ayet.ayetNo}
          verseCount={sure.verseCount}
          metinAr={ayet.metinAr}
          transliterasyon={ayet.transliterasyon}
          mealTr={ayet.mealTr}
        />


        <div className={styles.nav}>
          <Link
            href={prevAyet ? `/ayet/${sure.id}/${prevAyet}` : "#"}
            aria-disabled={!prevAyet}
            className={`${styles.navLink} ${!prevAyet ? styles.navLinkDisabled : ""}`}
          >
            ‹ Önceki ayet
          </Link>
          <Link
            href={nextAyet ? `/ayet/${sure.id}/${nextAyet}` : "#"}
            aria-disabled={!nextAyet}
            className={`${styles.navLink} ${!nextAyet ? styles.navLinkDisabled : ""}`}
          >
            Sonraki ayet ›
          </Link>
        </div>

        <div className={styles.appCta}>
          <p>Bu ayeti kavram ağıyla, sesli okumayla ve ezber stüdyosuyla birlikte deneyimlemek için tafsil uygulamasını aç.</p>
        </div>
      </div>
    </main>
  );
}

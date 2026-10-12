import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle } from "@/lib/api";
import styles from "./page.module.css";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) {
    return { title: "Makale Bulunamadı · tafsil" };
  }

  return {
    title: `${article.title} · tafsil`,
    description: article.summary,
    openGraph: {
      title: `${article.title} · tafsil`,
      description: article.summary,
    },
  };
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  function flushList() {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {currentList.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      // Skip h1 as it's in the header
      continue;
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={i}>{line.replace("## ", "")}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={i}>{line.replace("### ", "")}</h3>);
    } else if (line.startsWith("* ") || line.startsWith("- ")) {
      currentList.push(line.slice(2));
    } else if (line.startsWith("> ")) {
      flushList();
      elements.push(<blockquote key={i}>{line.replace("> ", "")}</blockquote>);
    } else {
      flushList();
      elements.push(<p key={i}>{line}</p>);
    }
  }
  flushList();

  return elements;
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <div className="container">
        <article className={styles.articleWrapper}>
          <div className={styles.breadcrumb}>
            <Link href="/makaleler" className={styles.backLink}>
              ← Tüm Makalelere Dön
            </Link>
          </div>

          <header className={styles.header}>
            <h1 className={styles.title}>{article.title}</h1>
            <div className={styles.meta}>
              <span>{article.author}</span>
              <span>·</span>
              <span>{article.date}</span>
              <span>·</span>
              <span>{article.reading_time_minutes} dk okuma</span>
            </div>
          </header>

          <div className={styles.verificationCard}>
            <div>
              <div className={styles.verificationTitle}>
                {article.is_verified ? "✓ Doğrulanmış Kur'an Referansı" : "Editoryal İnceleme"}
              </div>
              <div className={styles.verificationDesc}>
                Bu yazı, doğrudan Kur'an ayetleri, siyak-sibak bağlamı ve Arapça kök uyumu ilkeleriyle doğrulanmıştır.
              </div>
            </div>
            <div className={styles.verificationScore}>%{article.reference_score}</div>
          </div>

          <div className={styles.content}>
            {article.content_md ? renderMarkdown(article.content_md) : <p>{article.summary}</p>}
          </div>
        </article>
      </div>
    </main>
  );
}

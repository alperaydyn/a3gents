import Link from "next/link";
import ThemeToggle from "../theme-toggle/ThemeToggle";
import LanguageToggle from "../language-toggle/LanguageToggle";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          tafsil
        </Link>
        <nav className={styles.nav}>
          <Link href="/topluluk">Topluluk</Link>
          <Link href="/makaleler">Makaleler</Link>
          <Link href="/admin">Yönetim</Link>
          <Link href="/#nasil-calisir">Nasıl çalışır</Link>
          <Link href="/#uygulama">Uygulamayı al</Link>
        </nav>
        <div className={styles.actions}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <span className={styles.brand}>tafsil.net</span>
        <nav className={styles.links}>
          <Link href="/topluluk">Topluluk</Link>
          <Link href="/gizlilik">Gizlilik</Link>
          <Link href="/destek">Destek</Link>
          <Link href="/privacy">Privacy (EN)</Link>
          <Link href="/support">Support (EN)</Link>
          <a href="mailto:merhaba@tafsil.net">İletişim</a>
        </nav>
        <span className={styles.copy}>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

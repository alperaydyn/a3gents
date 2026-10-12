"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./LanguageToggle.module.css";

export default function LanguageToggle() {
  const pathname = usePathname() || "/";

  const isEn =
    pathname === "/en" ||
    pathname.startsWith("/en/") ||
    pathname === "/privacy" ||
    pathname === "/support";

  // Target paths when switching
  let trHref = "/";
  let enHref = "/en";

  if (pathname === "/privacy" || pathname === "/gizlilik") {
    trHref = "/gizlilik";
    enHref = "/privacy";
  } else if (pathname === "/support" || pathname === "/destek") {
    trHref = "/destek";
    enHref = "/support";
  }

  return (
    <div className={styles.container} role="group" aria-label="Dil seçimi / Language selection">
      <Link
        href={trHref}
        className={`${styles.item} ${!isEn ? styles.active : ""}`}
        aria-label="Türkçe sürüm"
      >
        TR
      </Link>
      <Link
        href={enHref}
        className={`${styles.item} ${isEn ? styles.active : ""}`}
        aria-label="English version"
      >
        EN
      </Link>
    </div>
  );
}

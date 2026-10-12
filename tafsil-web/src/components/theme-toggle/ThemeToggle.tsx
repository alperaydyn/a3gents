"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Reads the theme the inline head script already applied to <html> before
    // hydration, so this only mirrors it into state for the icon — it cannot
    // run during render because localStorage/matchMedia aren't available server-side.
    const stored = localStorage.getItem("tafsil-theme") as Theme | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors DOM state set by the pre-hydration inline script, not derivable during render
    setTheme(stored ?? (systemPrefersDark() ? "dark" : "light"));
  }, []);

  function toggle() {
    const next: Theme = (theme ?? (systemPrefersDark() ? "dark" : "light")) === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tafsil-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.toggle}
      aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
      title={theme === "dark" ? "Açık tema" : "Koyu tema"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

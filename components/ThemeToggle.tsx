"use client";

import { useEffect, useState } from "react";

const KEY = "kashing-theme";

/** App-wide light/dark toggle. Persists to localStorage; the inline script in
 *  app/layout.tsx applies the saved theme before paint to avoid a flash. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function toggle() {
    setLight((v) => {
      const next = !v;
      const root = document.documentElement;
      if (next) root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem(KEY, next ? "light" : "dark"); } catch {}
      return next;
    });
  }

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-card/60 transition"
      aria-label="Toggle light/dark theme"
    >
      {light ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      <span className="flex-1 text-left">{light ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}

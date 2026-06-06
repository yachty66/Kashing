import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kashing",
  description: "Your personal AI CFO. Local-first.",
};

// Applied before paint so the chosen theme doesn't flash. Defaults to dark.
const THEME_SCRIPT = `try{var t=localStorage.getItem('kashing-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

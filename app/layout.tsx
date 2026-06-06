import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kashing",
  description: "Your personal AI CFO. Local-first.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

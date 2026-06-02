import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "finance-app",
  description: "Personal finance, local-first.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

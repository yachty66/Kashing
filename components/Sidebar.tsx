"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; icon: () => React.ReactNode }[] = [
  { href: "/subscriptions", label: "Contracts", icon: SubsIcon },
  { href: "/analysis", label: "Analysis", icon: AnalysisIcon },
  { href: "/transactions", label: "Transactions", icon: TxIcon },
  { href: "/chat", label: "AI Chat", icon: ChatIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-sidebar flex flex-col sticky top-0 h-screen self-start">
      <div className="px-5 py-5 border-b border-line">
        <Link href="/analysis" className="font-semibold tracking-tight text-foreground">
          finance-app
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active ? "bg-card text-foreground" : "text-muted hover:text-foreground hover:bg-card/60"
              }`}
            >
              <Icon /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-line">
        <div className="px-2 text-xs text-muted">local-first · no sign-in</div>
      </div>
    </aside>
  );
}

const stroke = "currentColor";
const sw = "1.75";

function SubsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v6h-6" />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-7" />
    </svg>
  );
}

function TxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h14M17 7l-3-3M17 7l-3 3" />
      <path d="M21 17H7M7 17l3-3M7 17l3 3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

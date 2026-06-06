"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = { href?: string; label: string; icon?: () => React.ReactNode; soon?: boolean; section?: true };

const NAV: NavItem[] = [
  { href: "/subscriptions", label: "Contracts", icon: SubsIcon },
  { href: "/transactions", label: "Transactions", icon: TxIcon },
  { href: "/chat", label: "AI Chat", icon: ChatIcon },
  { label: "Finance", section: true },
  { href: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { href: "/bills", label: "Bills", icon: BookIcon },
  { href: "/cashflow", label: "Cash flow", icon: CashIcon },
  { href: "/audit", label: "Audit vault", icon: ShieldIcon },
  { label: "Master data", section: true },
  { href: "/team", label: "Team", icon: TeamIcon },
  { href: "/suppliers", label: "Suppliers", icon: TruckIcon },
  { href: "/customers", label: "Customers", icon: UsersIcon },
  { label: "More", section: true },
  { href: "/notifications", label: "Notifications", icon: BellIcon, soon: true },
  { href: "/analysis", label: "Analysis", icon: AnalysisIcon, soon: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-sidebar flex flex-col sticky top-0 h-screen self-start">
      <div className="px-5 py-5 border-b border-line">
        <Link href="/subscriptions" className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
          <span className="text-lg">Kashing</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, soon, section }) => {
          if (section) {
            return (
              <div key={`s-${label}`} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                {label}
              </div>
            );
          }
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href!}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active ? "bg-card text-foreground" : "text-muted hover:text-foreground hover:bg-card/60"
              }`}
            >
              {Icon && <Icon />}
              <span className="flex-1">{label}</span>
              {soon && (
                <span className="text-[9px] uppercase tracking-wider text-muted/70 border border-line rounded px-1.5 py-0.5">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-line space-y-1">
        <ThemeToggle />
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

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l3 3v17l-3-1.5L15 22l-3-1.5L9 22l-3-1.5L3 22V5a3 3 0 0 1 3-3z" />
      <path d="M8 7h6M8 11h8M8 15h5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="1.5" />
      <circle cx="18.5" cy="18.5" r="1.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

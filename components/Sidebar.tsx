"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

const NAV = [
  { href: "/subscriptions", label: "Subscriptions", icon: SubsIcon },
  { href: "/chat", label: "AI Chat", icon: ChatIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-sidebar flex flex-col">
      <div className="px-5 py-5 border-b border-line">
        <Link href="/subscriptions" className="font-semibold tracking-tight text-foreground">
          finance-app
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
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
        <div className="px-2 pb-2 text-xs text-muted truncate">{session?.user?.email ?? ""}</div>
        <button onClick={handleSignOut} className="btn btn-ghost w-full justify-start text-sm">
          Sign out
        </button>
      </div>
    </aside>
  );
}

function SubsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );
}

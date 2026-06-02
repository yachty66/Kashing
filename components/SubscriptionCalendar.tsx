"use client";

import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";

type Upcoming = { date: string; name: string; amount_eur: number; cadence: string; domain?: string };

const eur = (n: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function SubscriptionCalendar() {
  const [items, setItems] = useState<Upcoming[] | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/upcoming-subscriptions");
      if (!r.ok) {
        setItems([]);
        return;
      }
      const d = await r.json();
      setItems(d.upcoming);
    })();
  }, []);

  // Group items by YYYY-MM-DD for fast cell lookup
  const byDate = useMemo(() => {
    const m = new Map<string, Upcoming[]>();
    for (const u of items ?? []) {
      const arr = m.get(u.date) ?? [];
      arr.push(u);
      m.set(u.date, arr);
    }
    return m;
  }, [items]);

  // ---- month grid math ----
  const firstOfMonth = new Date(cursor.y, cursor.m, 1);
  const lastOfMonth = new Date(cursor.y, cursor.m + 1, 0);
  const daysInMonth = lastOfMonth.getDate();
  // JS Sunday=0; convert to Monday=0 ... Sunday=6 for a Mon-first grid.
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthLabel = firstOfMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

  // Items inside the visible month
  const monthItems = useMemo(
    () =>
      (items ?? []).filter((u) => {
        const d = new Date(u.date);
        return d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
      }),
    [items, cursor],
  );
  const monthTotal = monthItems.reduce((s, u) => s + u.amount_eur, 0);

  // Forward-30-day items (for the agenda block, regardless of month cursor)
  const next30 = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const horizon = new Date(t.getTime() + 30 * 86_400_000);
    return (items ?? []).filter((u) => {
      const d = new Date(u.date);
      return d >= t && d <= horizon;
    });
  }, [items]);
  const next30Total = next30.reduce((s, u) => s + u.amount_eur, 0);

  if (items === null) {
    return (
      <aside className="card p-6 min-w-0">
        <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
        <p className="text-muted text-sm">Loading…</p>
      </aside>
    );
  }

  if (items.length === 0) {
    return (
      <aside className="card p-6 min-w-0">
        <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
        <p className="text-muted text-sm">
          Nothing scheduled yet. Run <strong className="text-foreground">Pull &amp; analyze</strong> first so we know which subscriptions you have.
        </p>
      </aside>
    );
  }

  return (
    <aside className="card p-6 min-w-0">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <p className="text-xs text-muted mt-0.5">
            Next 30 days · <span className="text-foreground tabular-nums">{eur(next30Total)}</span> across {next30.length} charge{next30.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCursor(({ y, m }) => ({ y: m === 0 ? y - 1 : y, m: (m + 11) % 12 }))}
          className="btn btn-ghost text-sm px-2 py-1"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="text-sm font-medium">{monthLabel}</div>
        <button
          onClick={() => setCursor(({ y, m }) => ({ y: m === 11 ? y + 1 : y, m: (m + 1) % 12 }))}
          className="btn btn-ghost text-sm px-2 py-1"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 text-xs mb-4">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-muted py-1 select-none">{d}</div>
        ))}
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const subs = byDate.get(dateStr);
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          return (
            <div
              key={day}
              className={`aspect-square rounded-md text-[12px] tabular-nums flex flex-col items-center ${
                subs ? "justify-between p-1.5" : "justify-center p-1.5"
              } ${
                isToday
                  ? "bg-foreground text-background font-semibold"
                  : subs
                    ? "bg-card border border-foreground/30 text-foreground"
                    : isPast
                      ? "text-muted/40"
                      : "text-muted"
              }`}
              title={subs ? subs.map((s) => `${s.name} ${eur(s.amount_eur)}`).join("\n") : undefined}
            >
              <span>{day}</span>
              {subs && (
                <div className="flex items-center gap-1">
                  {subs.slice(0, 3).map((s, k) => (
                    <Logo
                      key={k}
                      domain={s.domain}
                      name={s.name}
                      size={16}
                      className={isToday ? "ring-1 ring-background" : ""}
                    />
                  ))}
                  {subs.length > 3 && (
                    <span
                      className={`text-[10px] font-medium tabular-nums ${
                        isToday ? "text-background" : "text-muted"
                      }`}
                    >
                      +{subs.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visible month total */}
      <div className="flex items-center justify-between text-xs text-muted mb-4 pb-3 border-b border-line">
        <span>{monthLabel} total</span>
        <span className="text-foreground tabular-nums">{eur(monthTotal)}</span>
      </div>

      {/* Agenda — every upcoming charge in the visible month, date-sorted */}
      {monthItems.length === 0 ? (
        <p className="text-xs text-muted">No subscription charges scheduled in {monthLabel}.</p>
      ) : (
        <ul className="space-y-3">
          {monthItems.map((u, i) => {
            const d = new Date(u.date);
            const day = d.getDate();
            const wk = d.toLocaleDateString("en-US", { weekday: "short" });
            const daysOut = Math.round(
              (d.getTime() - new Date(todayStr).getTime()) / 86_400_000,
            );
            const past = u.date < todayStr;
            return (
              <li key={i} className={`flex items-start gap-3 ${past ? "opacity-50" : ""}`}>
                <div className="w-10 shrink-0 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted">{wk}</div>
                  <div className="text-lg font-semibold tabular-nums leading-tight">{day}</div>
                </div>
                <Logo domain={u.domain} name={u.name} size={24} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{u.name}</div>
                  <div className="text-xs text-muted">
                    {past ? "today" : daysOut === 0 ? "today" : daysOut === 1 ? "tomorrow" : `in ${daysOut} days`}
                    {" · "}{u.cadence}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums whitespace-nowrap">{eur(u.amount_eur)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

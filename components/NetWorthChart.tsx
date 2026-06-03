"use client";

import { useState } from "react";

export type SnapshotPoint = {
  ym: string;
  netCents: number;
};

const eur = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
};

/**
 * Dependency-free net-worth chart. A single white line over a faint fill,
 * dots on each month, with a hover tooltip. Designed to look right with as
 * few as one data point — a lone month still renders a labelled dot.
 */
export function NetWorthChart({ points }: { points: SnapshotPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="h-64 grid place-items-center text-sm text-muted">
        No history yet — your first snapshot lands this month.
      </div>
    );
  }

  // viewBox geometry — we scale to a fixed coordinate space and let the SVG
  // stretch responsively via width=100%.
  const W = 720;
  const H = 240;
  const padX = 16;
  const padTop = 24;
  const padBottom = 28;

  const values = points.map((p) => p.netCents);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) {
    // flat / single point — give the line some breathing room
    min -= Math.abs(min || 100000) * 0.2 + 1;
    max += Math.abs(max || 100000) * 0.2 + 1;
  }
  const span = max - min;

  const n = points.length;
  const xOf = (i: number) =>
    n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2);
  const yOf = (v: number) =>
    padTop + (1 - (v - min) / span) * (H - padTop - padBottom);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.netCents).toFixed(1)}`)
    .join(" ");

  const areaPath =
    n === 1
      ? ""
      : `${linePath} L ${xOf(n - 1).toFixed(1)} ${(H - padBottom).toFixed(1)} L ${xOf(0).toFixed(1)} ${(H - padBottom).toFixed(1)} Z`;

  const zeroY = min <= 0 && max >= 0 ? yOf(0) : null;
  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* zero baseline */}
        {zeroY != null && (
          <line
            x1={padX}
            y1={zeroY}
            x2={W - padX}
            y2={zeroY}
            stroke="#262626"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {areaPath && <path d={areaPath} fill="url(#nwFill)" stroke="none" />}
        <path d={linePath} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* dots + invisible hover targets */}
        {points.map((p, i) => (
          <g key={p.ym}>
            <circle
              cx={xOf(i)}
              cy={yOf(p.netCents)}
              r={hover === i ? 4.5 : 3}
              fill={hover === i ? "#ffffff" : "#000000"}
              stroke="#ffffff"
              strokeWidth={1.75}
            />
            <rect
              x={xOf(i) - Math.max(W / n / 2, 12)}
              y={0}
              width={Math.max(W / n, 24)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {/* x labels — first, last, and hovered to avoid clutter */}
        {points.map((p, i) => {
          const show = i === 0 || i === n - 1 || hover === i;
          if (!show) return null;
          return (
            <text
              key={`lbl-${p.ym}`}
              x={xOf(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={11}
              fill="#9ca3af"
            >
              {monthLabel(p.ym)}
            </text>
          );
        })}
      </svg>

      {active && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="card px-3 py-2 text-center">
            <div className="text-xs text-muted">{monthLabel(active.ym)}</div>
            <div className="text-base font-semibold tabular-nums">{eur(active.netCents)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

export type ForecastPoint = {
  date: string; // YYYY-MM-DD
  balanceCents: number;
  lowerCents: number;
  upperCents: number;
};

export type ForecastMarker = {
  date: string;
  name: string;
  amountCents: number; // signed
  kind: "subscription" | "income" | "hypothetical";
};

const W = 820;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

const eur0 = (cents: number) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
const eur2 = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    signDisplay: "always",
  }).format(cents / 100);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function ForecastChart({
  points,
  markers,
  dipDate,
}: {
  points: ForecastPoint[];
  markers: ForecastMarker[];
  dipDate: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return <div className="card p-6 text-sm text-muted">Not enough data to draw a projection.</div>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ys = points.flatMap((p) => [p.lowerCents, p.upperCents, p.balanceCents]);
  let yMin = Math.min(...ys, 0);
  let yMax = Math.max(...ys, 0);
  if (yMin === yMax) {
    yMin -= 1000;
    yMax += 1000;
  }
  // A little headroom so the line never hugs the frame.
  const span = yMax - yMin;
  yMin -= span * 0.06;
  yMax += span * 0.06;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (c: number) => PAD.top + (1 - (c - yMin) / (yMax - yMin)) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.balanceCents)}`).join(" ");
  const bandPath =
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.upperCents)}`).join(" ") +
    " " +
    points
      .map((p, i) => `L${x(points.length - 1 - i)},${y(points[points.length - 1 - i].lowerCents)}`)
      .join(" ") +
    " Z";

  const zeroY = y(0);
  const zeroInRange = 0 >= yMin && 0 <= yMax;

  const dateToIndex = new Map(points.map((p, i) => [p.date, i]));
  const placedMarkers = markers
    .map((m) => ({ ...m, i: dateToIndex.get(m.date) }))
    .filter((m): m is ForecastMarker & { i: number } => m.i != null);

  const dipIdx = dipDate ? dateToIndex.get(dipDate) ?? null : null;

  // X ticks — ~5 evenly spaced.
  const tickCount = Math.min(5, points.length);
  const ticks = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / (tickCount - 1)) * (points.length - 1)),
  );

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="card p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y gridlines + labels */}
        {[yMax, (yMax + yMin) / 2, yMin].map((v, k) => (
          <g key={k}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1a1a1a" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b7280">
              {eur0(v)}
            </text>
          </g>
        ))}

        {/* Confidence band */}
        <path d={bandPath} fill="rgba(255,255,255,0.07)" stroke="none" />

        {/* Zero line */}
        {zeroInRange && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={zeroY}
              y2={zeroY}
              stroke="#4b5563"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={W - PAD.right} y={zeroY - 5} textAnchor="end" fontSize={10} fill="#9ca3af">
              €0
            </text>
          </>
        )}

        {/* Balance line */}
        <path d={linePath} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />

        {/* Event markers */}
        {placedMarkers.map((m, k) => (
          <circle
            key={k}
            cx={x(m.i)}
            cy={y(points[m.i].balanceCents)}
            r={m.kind === "hypothetical" ? 3.5 : 2.5}
            fill={m.kind === "income" ? "#ffffff" : "#000000"}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        ))}

        {/* Dip marker */}
        {dipIdx != null && (
          <g>
            <circle cx={x(dipIdx)} cy={y(points[dipIdx].balanceCents)} r={4} fill="#ffffff" />
            <line
              x1={x(dipIdx)}
              x2={x(dipIdx)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#ffffff"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.4}
            />
          </g>
        )}

        {/* X ticks */}
        {ticks.map((i, k) => (
          <text key={k} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b7280">
            {shortDate(points[i].date)}
          </text>
        ))}

        {/* Hover guide */}
        {hp && hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#525252"
              strokeWidth={1}
            />
            <circle cx={x(hover)} cy={y(hp.balanceCents)} r={3.5} fill="#ffffff" />
          </g>
        )}
      </svg>

      {/* Hover readout */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="text-muted">
          {hp ? (
            <>
              <span className="text-foreground/90">{shortDate(hp.date)}</span> · projected{" "}
              <span className="text-foreground tabular-nums">{eur0(hp.balanceCents)}</span>{" "}
              <span className="text-muted">
                ({eur0(hp.lowerCents)} – {eur0(hp.upperCents)})
              </span>
            </>
          ) : (
            <span>Hover the line to read any day’s projected balance.</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-white" /> income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full border border-white bg-black" /> charge
          </span>
        </div>
      </div>
    </div>
  );
}

export { eur0 as eurForecast0, eur2 as eurForecast2, shortDate as forecastShortDate };

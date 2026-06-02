"use client";

import { useState } from "react";
import { lookupDomain } from "@/lib/known-domains";

/**
 * Square service logo. Uses Google's favicon CDN at sz=64 when a domain is
 * known (works for ~all mainstream services with no API key needed); falls
 * back to a monochrome letter monogram when we can't resolve a domain or the
 * image fails to load.
 *
 * Resolution order: 1) `domain` prop (from the LLM analysis), 2) fuzzy lookup
 * of the subscription name against the known-domains table, 3) monogram.
 */
export function Logo({
  domain,
  name,
  size = 28,
  className = "",
}: {
  domain?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const initial = (name?.[0] ?? "?").toUpperCase();
  const resolved = domain || lookupDomain(name);

  if (!resolved || errored) {
    return (
      <div
        className={`shrink-0 rounded grid place-items-center bg-card border border-line text-foreground/70 text-xs font-semibold select-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolved)}&sz=64`}
      alt=""
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={`shrink-0 rounded ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

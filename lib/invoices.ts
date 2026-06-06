// Pure invoice helpers — no DB, no server-only imports, so both client
// components and API routes can use them. Money is always integer cents.

export type InvoiceStatus = "draft" | "sent" | "partly_paid" | "paid" | "void";
export type DisplayStatus = InvoiceStatus | "overdue";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "sent",
  "partly_paid",
  "paid",
  "void",
];

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/** Money formatting. Invoices are positive, so no forced sign. */
export function fmtMoney(cents: number, currency = "HKD"): string {
  try {
    return new Intl.NumberFormat("en-HK", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    // Unknown currency code — fall back to a plain number + code.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "12.50" / "12,50" → 1250 cents. Returns 0 for blank/invalid. */
export function inputToCents(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ".").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** 1250 cents → "12.50" for editing. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** A quantity is stored as text (preserves decimals like 1.5). */
export function parseQty(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function lineAmountCents(quantity: string, unitPriceCents: number): number {
  return Math.round(parseQty(quantity) * unitPriceCents);
}

export function computeTotals(
  lines: { amountCents: number }[],
  discountCents = 0,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((s, l) => s + (l.amountCents || 0), 0);
  const totalCents = Math.max(0, subtotalCents - (discountCents || 0));
  return { subtotalCents, totalCents };
}

/** Derive the user-facing status. "overdue" is computed, never stored. */
export function displayStatus(inv: {
  status: string;
  dueDate: string | null;
}): DisplayStatus {
  if (inv.status === "sent" || inv.status === "partly_paid") {
    if (inv.dueDate && inv.dueDate < todayISO()) return "overdue";
  }
  return inv.status as DisplayStatus;
}

const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partly_paid: "Partly paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export function statusLabel(s: DisplayStatus): string {
  return STATUS_LABELS[s] ?? s;
}

/** Pill className tuned to the strict black-and-white theme. */
export function statusPillClass(s: DisplayStatus): string {
  switch (s) {
    case "paid":
      return "pill pill-high";
    case "overdue":
      return "pill border-foreground text-foreground";
    case "sent":
    case "partly_paid":
      return "pill pill-medium";
    case "void":
    case "draft":
    default:
      return "pill pill-low";
  }
}

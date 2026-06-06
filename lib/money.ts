/** Format an amount in minor units (cents) with the right currency symbol. */
const SYMBOLS: Record<string, string> = {
  HKD: "HK$",
  EUR: "€",
  USD: "$",
  GBP: "£",
  CNY: "¥",
  JPY: "¥",
  TWD: "NT$",
};

export function money(cents: number | null | undefined, currency?: string | null): string {
  if (cents == null) return "—";
  const code = (currency ?? "HKD").toUpperCase();
  const sym = SYMBOLS[code] ?? `${code} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

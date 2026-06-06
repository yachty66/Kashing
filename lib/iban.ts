// IBAN / BIC normalisation + validation. Pure + client-safe (used by the SEPA
// page and the API). Ported from VSQ_Invoice (lib/iban.ts + sepa-validation.ts).

export function normalizeIban(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, "").toUpperCase();
  return s === "" ? null : s;
}

export function normalizeBic(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, "").toUpperCase();
  return s === "" ? null : s;
}

/** Validate IBAN format + MOD-97 checksum (ISO 13616). null = valid. */
export function validateIban(raw: string | null | undefined): string | null {
  if (!raw) return "IBAN missing";
  const iban = raw.replace(/\s/g, "").toUpperCase();

  if (iban.length < 15 || iban.length > 34) {
    return `IBAN has ${iban.length} characters (must be 15-34)`;
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return "Invalid IBAN format (must start with 2 letters + 2 digits)";
  }

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numericStr = rearranged
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : c;
    })
    .join("");

  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }
  if (remainder !== 1) return "Invalid IBAN checksum";
  return null;
}

/** Validate BIC/SWIFT format (ISO 9362). null = valid (BIC is optional). */
export function validateBic(raw: string | null | undefined): string | null {
  if (!raw) return null; // optional in SEPA since Feb 2016
  const bic = raw.replace(/\s/g, "").toUpperCase();
  if (bic.length !== 8 && bic.length !== 11) {
    return `BIC has ${bic.length} characters (must be 8 or 11)`;
  }
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    return "Invalid BIC format";
  }
  return null;
}

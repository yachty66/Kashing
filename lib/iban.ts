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
  if (!raw) return "IBAN fehlt";
  const iban = raw.replace(/\s/g, "").toUpperCase();

  if (iban.length < 15 || iban.length > 34) {
    return `IBAN hat ${iban.length} Zeichen (muss 15-34 sein)`;
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return "IBAN Format ungültig (muss mit 2 Buchstaben + 2 Ziffern beginnen)";
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
  if (remainder !== 1) return "IBAN Prüfziffer ungültig";
  return null;
}

/** Validate BIC/SWIFT format (ISO 9362). null = valid (BIC is optional). */
export function validateBic(raw: string | null | undefined): string | null {
  if (!raw) return null; // optional in SEPA since Feb 2016
  const bic = raw.replace(/\s/g, "").toUpperCase();
  if (bic.length !== 8 && bic.length !== 11) {
    return `BIC hat ${bic.length} Zeichen (muss 8 oder 11 sein)`;
  }
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    return "BIC Format ungültig";
  }
  return null;
}

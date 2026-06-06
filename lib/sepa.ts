// SEPA Credit Transfer Initiation (pain.001.001.03) generator + pre-flight
// validation. Ported almost verbatim from VSQ_Invoice (backend/services/sepa.ts
// + lib/sepa-validation.ts). EUR-only, EPC/DFÜ format German/Austrian banks
// accept. The single debtor is Kashing's business profile.
import { validateBic, validateIban } from "@/lib/iban";

export type SepaBill = {
  id: number;
  supplier: string;
  amountCents: number;
  payment_iban: string | null;
  payment_bic: string | null;
  invoice_number?: string | null;
  description?: string | null;
};

export type SepaEntity = { name: string; iban: string | null; bic: string | null };

/** Restricted SEPA character set (EPC). & → + (common in "GmbH & Co. KG"). */
function sanitize(text: string | null | undefined, maxLen: number): string {
  if (!text) return "";
  return text
    .replace(/&/g, "+")
    .replace(/[^a-zA-Z0-9 .,\-/+?:()'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLen);
}

function toEndToEndId(id: string): string {
  return id.replace(/-/g, "").substring(0, 35);
}

/**
 * Generate pain.001.001.03 XML. One <PmtInf> per bill (each with a single
 * <CdtTrfTxInf>) so banks that aggregate at PmtInf level still post each
 * transfer individually. `nowMs`/`isoNow` are passed in (Date.now()/new Date()
 * aren't available in some runtimes); the API supplies them.
 */
export function generateSepaXml(
  bills: SepaBill[],
  entity: SepaEntity,
  nowMs: number,
  isoNow: string,
): string {
  const ts = nowMs;
  const rand = (ts % 1_000_000).toString(36);
  const msgId = `MSG-${ts}-${rand}`;
  const creationDateTime = isoNow.replace(/\.\d+Z$/, "Z");
  const executionDate = isoNow.slice(0, 10);
  const totalAmount = bills.reduce((s, b) => s + b.amountCents, 0) / 100;

  const debtorIban = (entity.iban || "").replace(/\s/g, "").toUpperCase();
  const debtorBic = (entity.bic || "").replace(/\s/g, "").toUpperCase();
  const debtorName = sanitize(entity.name, 70);

  const debtorBicBlock = debtorBic
    ? `<DbtrAgt><FinInstnId><BIC>${debtorBic}</BIC></FinInstnId></DbtrAgt>`
    : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`;

  let pmtInfBlocks = "";
  bills.forEach((b, idx) => {
    const creditorIban = (b.payment_iban || "").replace(/\s/g, "").toUpperCase();
    const creditorBic = (b.payment_bic || "").replace(/\s/g, "").toUpperCase();
    const creditorName = sanitize(b.supplier, 70);
    const endToEndId = b.invoice_number
      ? sanitize(b.invoice_number, 35)
      : toEndToEndId(String(b.id));
    const reference =
      sanitize(b.invoice_number || b.description || String(b.id), 140) || "Payment";
    const amount = (b.amountCents / 100).toFixed(2);

    const creditorBicBlock = creditorBic
      ? `<CdtrAgt><FinInstnId><BIC>${creditorBic}</BIC></FinInstnId></CdtrAgt>`
      : `<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>`;

    const pmtInfId = `PMT-${ts}-${String(idx + 1).padStart(4, "0")}`;

    pmtInfBlocks += `
    <PmtInf>
      <PmtInfId>${pmtInfId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amount}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${executionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${debtorName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id><IBAN>${debtorIban}</IBAN></Id>
      </DbtrAcct>
      ${debtorBicBlock}
      <ChrgBr>SLEV</ChrgBr>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${endToEndId}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${amount}</InstdAmt>
        </Amt>
        ${creditorBicBlock}
        <Cdtr>
          <Nm>${creditorName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id><IBAN>${creditorIban}</IBAN></Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${reference}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${bills.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${debtorName}</Nm>
      </InitgPty>
    </GrpHdr>${pmtInfBlocks}
  </CstmrCdtTrfInitn>
</Document>`;
}

export type SepaValidationError = { billId: number | "entity"; supplier: string; errors: string[] };

/** Pre-flight validation before generating the XML. Empty = safe to export. */
export function validateSepaBills(
  bills: Array<{
    id: number;
    invoice_number: string | null;
    supplier: string | null;
    amountCents: number | null;
    currency: string | null;
    payment_iban: string | null;
    payment_bic: string | null;
  }>,
  entity: SepaEntity,
): SepaValidationError[] {
  const result: SepaValidationError[] = [];

  const entityErrors: string[] = [];
  const eIban = validateIban(entity.iban);
  if (eIban) entityErrors.push(`Sender IBAN: ${eIban}`);
  const eBic = validateBic(entity.bic);
  if (eBic) entityErrors.push(`Sender BIC: ${eBic}`);
  if (!entity.name?.trim()) entityErrors.push("Sender name missing");
  if (entityErrors.length) result.push({ billId: "entity", supplier: entity.name || "Sender", errors: entityErrors });

  for (const b of bills) {
    const errors: string[] = [];
    const supplierName = b.supplier || "Unknown";
    if (b.amountCents == null || b.amountCents <= 0) errors.push("Amount missing or zero");
    if (b.currency && b.currency !== "EUR") errors.push(`Currency ${b.currency} — SEPA is EUR only`);
    const ibanErr = validateIban(b.payment_iban);
    if (ibanErr) errors.push(`IBAN: ${ibanErr}`);
    const bicErr = validateBic(b.payment_bic);
    if (bicErr) errors.push(`BIC: ${bicErr}`);
    if (!supplierName || supplierName === "Unknown") errors.push("Supplier name missing");
    if (errors.length) result.push({ billId: b.id, supplier: supplierName, errors });
  }
  return result;
}

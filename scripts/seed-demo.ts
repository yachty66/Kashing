/**
 * Seed a coherent Hong Kong SMB demo: "Kowloon Trading Co."
 *
 *   npm run seed:demo
 *
 * Wipes the business/demo tables (customers, invoices, bills, suppliers,
 * expenses, qr_issuances, agent_messages, transactions) and reseeds a full
 * money-in / money-out story. KEEPS the connected HK bank accounts and the two
 * WhatsApp phone numbers (from MANAGER_PHONE / EMPLOYEE_PHONE), just renamed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const iso = (d: Date) => d.toISOString().slice(0, 10);
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysAhead(n: number) {
  return daysAgo(-n);
}

async function main() {
  const { db } = await import("../lib/db");
  const s = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const managerPhone = (process.env.MANAGER_PHONE || "+85291110001").replace(/\s+/g, "");
  const employeePhone = (process.env.EMPLOYEE_PHONE || "+85291110002").replace(/\s+/g, "");

  // --- 1. Wipe demo/business tables (FK-safe order). Keep accounts + users. ---
  await db.delete(s.invoicePayments);
  await db.delete(s.invoiceLines);
  await db.delete(s.invoices);
  await db.delete(s.bills);
  await db.delete(s.expenses);
  await db.delete(s.qrIssuances);
  await db.delete(s.agentMessages);
  await db.delete(s.transactions);
  await db.delete(s.customers);
  await db.delete(s.suppliers);
  console.log("✓ wiped demo tables");

  // --- 2. Business profile -------------------------------------------------
  const existingBp = await db.select().from(s.businessProfile).limit(1);
  const bpValues = {
    name: "Kowloon Trading Co.",
    brNumber: "51234567",
    addressLines: "Unit 1203, 12/F, Trade Centre, 135 Bonham Strand, Sheung Wan, Hong Kong",
    email: "accounts@kowloontrading.hk",
    phone: managerPhone,
    paymentInstructions: "Pay by FPS to 9111 0001 (Kowloon Trading Co.) or scan the QR on the invoice.",
    fpsProxyType: "mobile",
    fpsProxyId: "+85291110001",
    payMeLink: "https://payme.hsbc/kowloontrading",
    defaultCurrency: "HKD",
    invoicePrefix: "INV",
    nextSeq: 5,
    footerNote: "Thank you for your business. Payment due per the terms above.",
  };
  if (existingBp[0]) await db.update(s.businessProfile).set(bpValues).where(eq(s.businessProfile.id, existingBp[0].id));
  else await db.insert(s.businessProfile).values(bpValues);
  console.log("✓ business profile: Kowloon Trading Co.");

  // --- 3. Team (rename existing phones; set controls) ----------------------
  async function upsertUser(phone: string, name: string, role: string, extra: Record<string, unknown> = {}) {
    const [u] = await db.select().from(s.users).where(eq(s.users.phone, phone)).limit(1);
    if (u) await db.update(s.users).set({ name, role, ...extra }).where(eq(s.users.id, u.id));
    else await db.insert(s.users).values({ phone, name, role, ...extra });
    const [r] = await db.select().from(s.users).where(eq(s.users.phone, phone)).limit(1);
    return r;
  }
  const manager = await upsertUser(managerPhone, "Wing Lau (Owner)", "manager");
  const employee = await upsertUser(employeePhone, "Ka Ho Chan", "employee", {
    monthlyAllowanceCents: 500000, // HK$5,000
    maxSingleQrCents: 100000, // HK$1,000
    autoApproveUnderCents: 50000, // HK$500 — so a HK$420 lunch auto-approves in the demo
  });
  console.log(`✓ team: ${manager.name} (manager), ${employee.name} (employee)`);

  // --- 4. Customers (one carries the employee phone so reminders deliver) --
  const [starFerry] = await db.insert(s.customers).values({
    name: "Star Ferry Logistics Ltd", email: "ap@starferrylog.hk", phone: employeePhone,
    city: "Kwun Tong", brNumber: "61112233", defaultCurrency: "HKD", creditTermsDays: 30,
  }).returning();
  const [mongkok] = await db.insert(s.customers).values({
    name: "Mongkok Retail Group", email: "finance@mkretail.hk",
    city: "Mong Kok", brNumber: "62223344", defaultCurrency: "HKD", creditTermsDays: 60,
  }).returning();
  const [central] = await db.insert(s.customers).values({
    name: "Central Consulting Partners", email: "billing@centralcp.hk",
    city: "Central", brNumber: "63334455", defaultCurrency: "HKD", creditTermsDays: 15,
  }).returning();
  // More customers for a fuller list (no invoices reference these).
  await db.insert(s.customers).values([
    { name: "Victoria Harbour Seafood Ltd", email: "ap@vhseafood.hk", city: "Aberdeen", brNumber: "64445566", defaultCurrency: "HKD", creditTermsDays: 30 },
    { name: "Kowloon Bay Electronics Ltd", email: "finance@kbelectronics.hk", city: "Kowloon Bay", brNumber: "65556677", defaultCurrency: "HKD", creditTermsDays: 45 },
    { name: "Peninsula Boutique Hotel", email: "accounts@peninsulabtq.hk", city: "Tsim Sha Tsui", brNumber: "66667788", defaultCurrency: "HKD", creditTermsDays: 30 },
    { name: "Lantau Tours & Travel", email: "billing@lantautours.hk", city: "Tung Chung", brNumber: "67778899", defaultCurrency: "HKD", creditTermsDays: 15 },
    { name: "Wan Chai Print House", email: "ap@wcprint.hk", city: "Wan Chai", brNumber: "68889900", defaultCurrency: "HKD", creditTermsDays: 30 },
    { name: "New Territories Farm Produce", email: "orders@ntfarm.hk", city: "Yuen Long", brNumber: "69990011", defaultCurrency: "HKD", creditTermsDays: 30 },
    { name: "Causeway Bay Fashion Co.", email: "finance@cbfashion.hk", city: "Causeway Bay", brNumber: "70001122", defaultCurrency: "HKD", creditTermsDays: 60 },
    { name: "Golden Dragon Restaurant Group", email: "ap@goldendragon.hk", city: "Sha Tin", brNumber: "71112233", defaultCurrency: "HKD", creditTermsDays: 14 },
    { name: "Aberdeen Marina Services", email: "billing@aberdeenmarina.hk", city: "Aberdeen", brNumber: "72223344", defaultCurrency: "HKD", creditTermsDays: 30 },
    { name: "Sai Kung Cafe & Bakery", email: "hello@saikungcafe.hk", city: "Sai Kung", brNumber: "73334455", defaultCurrency: "HKD", creditTermsDays: 15 },
  ]);
  console.log("✓ customers: 13");

  // --- 5. Suppliers --------------------------------------------------------
  const [printing] = await db.insert(s.suppliers).values({
    name: "Sham Shui Po Printing", normalizedName: "sham shui po printing", city: "Sham Shui Po",
    taxId: "71234567", email: "sales@sspprint.hk", fpsProxyType: "mobile", fpsProxyId: "+85261234567",
  }).returning();
  await db.insert(s.suppliers).values({
    name: "HK Stationery Wholesale", normalizedName: "hk stationery wholesale", city: "Kwai Chung",
    taxId: "72345678", email: "orders@hkstationery.hk", fpsProxyType: "fpsid", fpsProxyId: "1088277",
  });
  // More suppliers for a fuller AP list.
  await db.insert(s.suppliers).values([
    { name: "Kwai Chung Logistics Ltd", normalizedName: "kwai chung logistics ltd", city: "Kwai Chung", taxId: "73456789", email: "ops@kclogistics.hk", fpsProxyType: "fpsid", fpsProxyId: "2099388" },
    { name: "HK Packaging Supplies", normalizedName: "hk packaging supplies", city: "Tuen Mun", taxId: "74567890", email: "sales@hkpackaging.hk", fpsProxyType: "mobile", fpsProxyId: "+85262345678" },
    { name: "Pearl River Textiles", normalizedName: "pearl river textiles", city: "Cheung Sha Wan", taxId: "75678901", email: "orders@prtextiles.hk", fpsProxyType: "mobile", fpsProxyId: "+85263456789" },
    { name: "PCCW Business", normalizedName: "pccw business", city: "Quarry Bay", taxId: "76789012", email: "billing@pccw.hk" },
    { name: "Hongkong Electric", normalizedName: "hongkong electric", city: "North Point", taxId: "77890123", email: "accounts@hkelectric.hk" },
    { name: "Wing Kee Hardware", normalizedName: "wing kee hardware", city: "Mong Kok", taxId: "78901234", email: "info@wingkee.hk", fpsProxyType: "mobile", fpsProxyId: "+85264567890" },
    { name: "Cathay Office Furniture", normalizedName: "cathay office furniture", city: "San Po Kong", taxId: "79012345", email: "sales@cathayoffice.hk", fpsProxyType: "fpsid", fpsProxyId: "3011477" },
    { name: "Maxim's Catering Supplies", normalizedName: "maxim's catering supplies", city: "Cheung Sha Wan", taxId: "80123456", email: "ap@maxims.hk" },
  ]);
  console.log("✓ suppliers: 10");

  // --- 6. Invoices (full lifecycle) ---------------------------------------
  async function makeInvoice(opts: {
    number: string; customerId: number; customerName: string; totalCents: number;
    issue: Date; due: Date; status: string; amountPaidCents?: number; paidAt?: Date; desc: string;
  }) {
    const [inv] = await db.insert(s.invoices).values({
      number: opts.number, customerId: opts.customerId, customerName: opts.customerName,
      issueDate: iso(opts.issue), dueDate: iso(opts.due), currency: "HKD", status: opts.status,
      subtotalCents: opts.totalCents, discountCents: 0, totalCents: opts.totalCents,
      amountPaidCents: opts.amountPaidCents ?? 0, sentAt: opts.issue, paidAt: opts.paidAt ?? null,
    }).returning();
    await db.insert(s.invoiceLines).values({
      invoiceId: inv.id, description: opts.desc, quantity: "1",
      unitPriceCents: opts.totalCents, amountCents: opts.totalCents, sortOrder: 0,
    });
    return inv;
  }
  const invOverdue = await makeInvoice({ number: "INV-2026-0001", customerId: starFerry.id, customerName: starFerry.name, totalCents: 850000, issue: daysAgo(35), due: daysAgo(20), status: "sent", desc: "Freight forwarding — March shipments" });
  await makeInvoice({ number: "INV-2026-0002", customerId: mongkok.id, customerName: mongkok.name, totalCents: 1200000, issue: daysAgo(2), due: daysAhead(58), status: "sent", desc: "Wholesale goods — Q2 order" });
  await makeInvoice({ number: "INV-2026-0003", customerId: central.id, customerName: central.name, totalCents: 2000000, issue: daysAgo(10), due: daysAhead(5), status: "partly_paid", amountPaidCents: 500000, desc: "Consulting retainer — June" });
  const invPaid = await makeInvoice({ number: "INV-2026-0004", customerId: starFerry.id, customerName: starFerry.name, totalCents: 600000, issue: daysAgo(50), due: daysAgo(20), status: "paid", amountPaidCents: 600000, paidAt: daysAgo(25), desc: "Freight forwarding — February" });
  console.log("✓ invoices: 4 (overdue / current / partly-paid / paid)");

  // --- 7. Bank transactions on the HKD Checking account -------------------
  const accts = await db.select().from(s.accounts);
  const checking = accts.find((a) => (a.displayName ?? "").toLowerCase().includes("hkd checking")) ?? accts[0];
  if (!checking) throw new Error("No bank account found — connect a bank first.");
  async function tx(amountCents: number, memo: string, when: Date, counterparty?: string) {
    // Set both names so the merchant shows whether it's a credit or a debit
    // (the bookkeeping view reads debtorName for credits, creditorName for debits).
    const [t] = await db.insert(s.transactions).values({
      accountId: checking.id, gocardlessId: `demo-${Math.random().toString(36).slice(2, 10)}`,
      bookingDate: iso(when), valueDate: iso(when), amountCents, currency: "HKD",
      creditorName: counterparty ?? null, debtorName: counterparty ?? null, memo, status: "booked", raw: {},
    }).returning();
    return t;
  }
  // Incoming credit that MATCHES the overdue invoice (number + exact amount) but
  // is left unreconciled — hit /api/reconcile to watch it settle live.
  await tx(850000, `FPS CREDIT ${invOverdue.number} STAR FERRY LOGISTICS`, daysAgo(0), "Star Ferry Logistics Ltd");
  // Already-settled paid invoice's credit (linked below).
  const paidCredit = await tx(600000, `FPS ${invPaid.number} STAR FERRY`, daysAgo(25), "Star Ferry Logistics Ltd");
  // Some history for bookkeeping / cash-flow realism.
  await tx(2500000, "CENTRAL CONSULTING RETAINER", daysAgo(40), "Central Consulting Partners");
  await tx(-300000, "RENT JUNE - KOWLOON PROPERTIES", daysAgo(5), "Kowloon Properties");
  await tx(-85000, "SHAM SHUI PO PRINTING", daysAgo(12), "Sham Shui Po Printing");
  console.log("✓ transactions: 5 (1 awaiting reconciliation)");

  // --- 8. Invoice payments -------------------------------------------------
  await db.insert(s.invoicePayments).values({ invoiceId: invPaid.id, transactionId: paidCredit.id, amountCents: 600000, paidAt: iso(daysAgo(25)), method: "reconciled", note: "auto-reconciled" });
  // partly-paid invoice: a manual deposit
  const [inv3] = await db.select().from(s.invoices).where(eq(s.invoices.number, "INV-2026-0003")).limit(1);
  await db.insert(s.invoicePayments).values({ invoiceId: inv3.id, amountCents: 500000, paidAt: iso(daysAgo(8)), method: "manual", note: "deposit" });
  console.log("✓ invoice payments: 2");

  // --- 9. Expenses (employee receipts) ------------------------------------
  const receipt = (label: string) => `https://placehold.co/480x640/png?text=${encodeURIComponent(label)}`;
  await db.insert(s.expenses).values({
    submittedBy: employee.id, amountCents: 8500, currency: "HKD", merchant: "Maxim's MX",
    brNumber: "34567890", category: "Meals", expenseDate: iso(daysAgo(3)),
    receiptUrl: receipt("Maxim's HK$85"), paymentType: "reimbursement", status: "approved", approvedBy: manager.id,
    rawParse: { seeded: true },
  });
  await db.insert(s.expenses).values({
    submittedBy: employee.id, amountCents: 65000, currency: "HKD", merchant: "Tin Lung Heen",
    brNumber: "45678901", category: "Client entertainment", expenseDate: iso(daysAgo(1)),
    receiptUrl: receipt("Tin Lung Heen HK$650"), paymentType: "reimbursement", status: "pending", rawParse: { seeded: true },
  });
  await db.insert(s.expenses).values({
    submittedBy: employee.id, amountCents: 120000, currency: "HKD", merchant: "Sham Shui Po Printing",
    brNumber: "56789012", category: "Office supplies", expenseDate: iso(daysAgo(5)),
    receiptUrl: receipt("SSP Printing HK$1200"), paymentType: "reimbursement", status: "approved", approvedBy: manager.id,
    rawParse: { seeded: true },
  });
  console.log("✓ expenses: 3 (approved / pending / approved)");

  // --- 10. Supplier bills (AP) --------------------------------------------
  await db.insert(s.bills).values({
    supplierId: printing.id, supplierName: printing.name, invoiceNumber: "SSP-8841",
    invoiceDate: iso(daysAgo(3)), dueDate: iso(daysAhead(10)), description: "Brochure printing — 5,000 units",
    amountCents: 300000, currency: "HKD", status: "unpaid",
  });
  await db.insert(s.bills).values({
    supplierId: printing.id, supplierName: printing.name, invoiceNumber: "SSP-8702",
    invoiceDate: iso(daysAgo(20)), description: "Business cards", amountCents: 45000, currency: "HKD",
    status: "paid", paidAt: daysAgo(15),
  });
  console.log("✓ bills: 2 (1 unpaid)");

  console.log("\n✅ Kowloon Trading Co. demo seeded. Try: WhatsApp 'show overdue invoices', then POST /api/reconcile.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

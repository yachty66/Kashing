export const CATEGORIES = [
  "Groceries",
  "Eating Out",
  "Transport",
  "Travel",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Bills & Utilities",
  "Rent & Housing",
  "Health & Insurance",
  "Fitness",
  "Personal Care",
  "Income",
  "Transfers",
  "Loans & Fees",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Normalized merchant identifier — the key we group on for categorization.
 * Lowercased creditor/debtor name when available, else the first few words
 * of the memo. Matches the convention used by the subscription detector.
 */
export function merchantKey(t: {
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
  amountCents: number | string;
}): string {
  const cred = (t.creditorName ?? "").trim().toLowerCase();
  if (cred) return cred;
  const deb = (t.debtorName ?? "").trim().toLowerCase();
  if (deb) return deb;
  const memo = (t.memo ?? "").toLowerCase().split(/\s+/).slice(0, 4).join(" ");
  return memo || "(unknown)";
}

/**
 * Cheap deterministic rule classifier. Catches the obvious cases without
 * burning LLM tokens — internal transfers, incoming salary, plus a wide
 * net of merchant-keyword rules for the most common spending categories.
 * Returns null when no rule matches and the LLM should decide.
 */
export function ruleClassify(t: {
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
  amountCents: number;
}): Category | null {
  const amt = Number(t.amountCents);
  const memo = (t.memo ?? "").toLowerCase();
  const cred = (t.creditorName ?? "").toLowerCase();
  const haystack = `${cred} ${memo}`;

  // Internal Spaces / sub-account transfers (N26-flavoured but generally safe)
  const transferPhrases = [
    "nach hauptkonto",
    "von hauptkonto",
    "nach tagesgeld",
    "von tagesgeld",
    "nach freelancer",
    "von freelancer",
    "nach gpu",
    "von gpu",
    "nach poker",
    "von poker",
    "nach porsche",
    "von porsche",
    "monatliche überweisung",
    "rückzahlung des n26 kredits",
  ];
  if (transferPhrases.some((p) => memo.includes(p))) return "Transfers";

  // Pure fees we know about
  if (memo.includes("gebühr für sepa") || memo.includes("cash26 deposit fee")) {
    return "Loans & Fees";
  }

  // Big incoming amounts with no creditor → likely salary / business income.
  // We let the LLM still see merchant context for borderline cases by NOT
  // hardcoding a threshold; just say: positive + no debtor name → Income.
  if (amt > 0 && !t.debtorName) return "Income";

  // Spending categories — keyword nets against creditor + memo. Ordered:
  // more specific buckets first (subscriptions before shopping; insurance
  // before bills) so a Vodafone insurance ride doesn't get bucketed twice.
  const rules: { category: Category; keywords: string[] }[] = [
    {
      category: "Groceries",
      keywords: [
        "rewe", "edeka", "lidl", "aldi", "penny", "netto", "kaufland",
        "dm-drogerie", "dm filiale", "rossmann", "müller drogerie",
        "supermarkt", "bio company", "alnatura", "denns biomarkt",
      ],
    },
    {
      category: "Eating Out",
      keywords: [
        "restaurant", "mcdonald", "burger", "pizza", "kebap", "kebab",
        "döner", "doener", "sushi", "ramen", "café", "cafe", "kaffee",
        "starbucks", "vapiano", "hans im glück", "five guys", "subway",
        "kfc", "espresso", "bistro",
      ],
    },
    {
      category: "Subscriptions",
      keywords: [
        "netflix", "spotify", "disney+", "disney plus", "hbo max",
        "youtube premium", "amazon prime", "apple.com/bill", "apple services",
        "icloud", "github", "vercel", "openai", "anthropic", "claude.ai",
        "cursor.ai", "figma", "adobe", "dropbox", "notion", "linear.app",
        "openrouter",
      ],
    },
    {
      category: "Entertainment",
      keywords: [
        "kino", "cinema", "cinemaxx", "uci kinowelt", "yorck", "twitch",
        "ticketmaster", "eventim", "steam games", "playstation", "xbox",
      ],
    },
    {
      category: "Transport",
      keywords: [
        "bvg", "db bahn", "deutsche bahn", "db vertrieb", "uber", "bolt.eu",
        "free now", "freenow", "taxi", "lime", "tier mobility", "voi",
        "shell", "aral", "total energies", "esso", "jet tank", "tankstelle",
        "sixt", "miles mobility", "share now", "flixbus", "mvg", "hvv",
      ],
    },
    {
      category: "Travel",
      keywords: [
        "booking.com", "booking com", "airbnb", "hotel ", "hostel",
        "lufthansa", "ryanair", "easyjet", "eurowings", "tui", "sncf",
        "trivago", "expedia", "kayak.com",
      ],
    },
    {
      category: "Rent & Housing",
      keywords: [
        "miete", "rent payment", "vermieter", "wohnungsbau", "nebenkosten",
        "hausverwaltung", "vonovia", "deutsche wohnen",
      ],
    },
    {
      category: "Bills & Utilities",
      keywords: [
        "vodafone", "telekom", "o2 telefónica", "1&1", "drillisch",
        "simyo", "congstar", "vattenfall", "eon", "e.on", "e-on",
        "stadtwerke", "strom anbieter", "stromio", "gas anbieter",
      ],
    },
    {
      category: "Health & Insurance",
      keywords: [
        "versicherung", "allianz", "axa", "ergo", "huk-coburg",
        "techniker krankenkasse", "tk-krankenkasse", "aok ", "barmer",
        "dak-gesundheit", "haftpflicht", "krankenversicherung",
        "kfz versicherung", "apotheke", "pharmacy", "arztpraxis",
        "zahnarzt",
      ],
    },
    {
      category: "Fitness",
      keywords: [
        "fitness", "mcfit", "urban sports", "urbansports", "fitx",
        "clever fit", "gym ", "yoga studio", "crossfit",
      ],
    },
    {
      category: "Personal Care",
      keywords: [
        "friseur", "barber", "hair salon", "kosmetik", "spa ",
        "massage", "nagelstudio",
      ],
    },
    {
      category: "Shopping",
      keywords: [
        "amazon", "amzn ", "zalando", "otto.de", "mediamarkt", "saturn",
        "ikea", "h&m", "h und m", "zara", "asos", "bauhaus", "obi",
        "thalia", "decathlon", "tk maxx",
      ],
    },
  ];

  for (const { category, keywords } of rules) {
    if (keywords.some((kw) => haystack.includes(kw))) return category;
  }

  return null;
}

/** Categories that show up on the Budgets page. Excludes Income (not a
 * spending bucket) and Transfers (internal movement, not real spend). */
export const BUDGETABLE_CATEGORIES: Category[] = [
  "Groceries",
  "Eating Out",
  "Transport",
  "Travel",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Bills & Utilities",
  "Rent & Housing",
  "Health & Insurance",
  "Fitness",
  "Personal Care",
  "Loans & Fees",
  "Other",
];

import { Placeholder } from "@/components/Placeholder";

export default function NetWorthPage() {
  return (
    <Placeholder
      title="Net worth"
      tagline="Sum of every account balance, plotted over time. Even with only checking accounts wired today the chart already tells a story."
      planned={[
        "Live balances pulled from GoCardless for every connected bank account",
        "Manual entries for assets the API can't see — savings outside the bank, investments, property",
        "Manual entries for liabilities — credit-card debt, mortgage, loans",
        "Monthly snapshots auto-taken so the chart has memory even if you change which accounts are connected",
        "This is how Monarch hooks people for the long term: 'my net worth has gone up €X this year'",
      ]}
    />
  );
}

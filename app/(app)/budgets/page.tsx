import { Placeholder } from "@/components/Placeholder";

export default function BudgetsPage() {
  return (
    <Placeholder
      title="Budgets"
      tagline="One cap per category, monthly. Not YNAB-complex — just a number you set and a bar that fills up."
      planned={[
        "Set a monthly cap per category ('Eating Out: €300/mo')",
        "Progress bars showing how close you are this month",
        "Auto-suggested budgets based on your 3-month median spend per category",
        "Warning at 80%, alarm at 100%, badge in the sidebar when over",
        "This is the engagement loop — subscription detection is one-and-done; budgets bring you back daily",
      ]}
    />
  );
}

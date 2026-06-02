import { Placeholder } from "@/components/Placeholder";

export default function CategoriesPage() {
  return (
    <Placeholder
      title="Categories"
      tagline="Where your money actually goes. Every transaction lands in one of ~15 categories — Groceries, Eating Out, Transport, Rent, Utilities, Entertainment, etc."
      planned={[
        "Stacked bar of category spending across the last 6 months",
        "Per-category drill-down: which merchants made up Groceries this month?",
        "User overrides: recategorize a merchant once, sticks forever (e.g. 'Amazon → Shopping' becomes 'Amazon → Groceries' for you)",
        "Auto-categorization done by the LLM in a single batch on each pull, so it's cheap",
        "Feeds the Budgets page and the Overview's monthly delta",
      ]}
    />
  );
}

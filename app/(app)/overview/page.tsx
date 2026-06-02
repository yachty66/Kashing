import { Placeholder } from "@/components/Placeholder";

export default function OverviewPage() {
  return (
    <Placeholder
      title="Overview"
      tagline="The home of the app. Answers the four questions you want first thing in the morning, in five seconds."
      planned={[
        "Spent vs received this month, with delta against last month",
        "Net cash position — am I saving or burning?",
        "Three transactions worth your attention this week (largest, first-time merchant, biggest unusual)",
        "Live AI commentary on the month so far ('groceries up €340, mostly REWE')",
        "Quick links into the three pages you'll act on next",
      ]}
    />
  );
}

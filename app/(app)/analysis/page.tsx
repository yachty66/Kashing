"use client";

import OverviewPage from "../overview/page";
import CategoriesPage from "../categories/page";
import BudgetsPage from "../budgets/page";
import ForecastPage from "../forecast/page";
import NetWorthPage from "../net-worth/page";

/**
 * Analysis: a single scrollable view that stacks the five "passive read"
 * dashboards previously split into separate sidebar tabs. Subscriptions,
 * Transactions, and AI Chat keep their own top-level nav because each has
 * a distinct cognitive job; everything else is one continuous narrative
 * top-to-bottom (this month → where it goes → where it's headed → what
 * you own).
 *
 * Each section is the existing page component, rendered as-is. Visual
 * polish (merging headers, deduplicating action buttons) is a follow-up.
 */
export default function AnalysisPage() {
  return (
    <div className="divide-y divide-line/40">
      <Section><OverviewPage /></Section>
      <Section><CategoriesPage /></Section>
      <Section><BudgetsPage /></Section>
      <Section><ForecastPage /></Section>
      <Section><NetWorthPage /></Section>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-line/40 last:border-b-0">{children}</div>;
}

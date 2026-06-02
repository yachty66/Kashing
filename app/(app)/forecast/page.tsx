import { Placeholder } from "@/components/Placeholder";

export default function ForecastPage() {
  return (
    <Placeholder
      title="Forecast"
      tagline="Your balance, day-by-day, for the next 30 days. The most useful thing a finance app can do that your bank's app can't."
      planned={[
        "Day-by-day projected balance line: current balance + expected income − expected outgoing",
        "Built from the recurring subscription + recurring income detection that already runs on every pull",
        "Warns 'you dip below €0 on the 19th' before it happens",
        "Toggle to add a one-off hypothetical ('what if I buy a €1,200 laptop next Friday?')",
        "Confidence shading — wider band as the projection goes further out",
      ]}
    />
  );
}

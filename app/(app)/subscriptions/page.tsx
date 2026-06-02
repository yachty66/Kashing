"use client";

export default function SubscriptionsPage() {
  return (
    <div className="p-8 max-w-6xl w-full">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-muted text-sm mt-1">
          Every recurring charge across your connected accounts.
        </p>
      </header>

      <div className="card p-10 text-center">
        <p className="text-foreground/80 mb-4">
          No bank connected yet.
        </p>
        <p className="text-muted text-sm mb-6 max-w-md mx-auto">
          Connect a European bank via GoCardless to import transactions and
          have the LLM surface every active subscription.
        </p>
        <button className="btn btn-primary opacity-60 cursor-not-allowed" disabled>
          Connect a bank · coming next
        </button>
      </div>
    </div>
  );
}

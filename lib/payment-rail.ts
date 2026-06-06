/**
 * Outbound payment rail — how money actually leaves the account (reimbursing an
 * employee, paying a supplier bill). Kept behind an interface so the demo runs
 * on a mock while production can swap in a real rail without touching callers.
 *
 * Why mocked for the hackathon: pushing money OUT programmatically needs
 * payment-initiation rights that read-only bank aggregation (GoCardless/Finverse
 * AIS) cannot provide. A real rail = an EMI/wallet (Airwallex, Currenxie) with
 * weeks of KYB, or a stablecoin treasury. The interface is the "production-ready"
 * artifact; MockRail keeps the decision pipeline (approval, allowance, matching)
 * 100% real.
 */

export type PayoutRequest = {
  amountCents: number;
  currency: string; // "HKD"
  /** FPS proxy of the payee (employee or supplier). */
  toProxyType?: "mobile" | "email" | "fpsid" | null;
  toProxyId?: string | null;
  reference: string; // claim/bill reference, rides into the bank memo
  payeeName?: string | null;
};

export type PayoutResult = {
  ok: boolean;
  rail: string;
  externalId: string; // provider/transaction handle
  message: string;
};

export interface PaymentRail {
  readonly name: string;
  payout(req: PayoutRequest): Promise<PayoutResult>;
}

/** Demo rail: records the intent and returns success without moving real money. */
class MockRail implements PaymentRail {
  readonly name = "mock";
  async payout(req: PayoutRequest): Promise<PayoutResult> {
    const externalId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      ok: true,
      rail: this.name,
      externalId,
      message: `Simulated FPS payout of ${(req.amountCents / 100).toFixed(2)} ${req.currency} to ${req.payeeName ?? req.toProxyId ?? "payee"} (ref ${req.reference}).`,
    };
  }
}

// Production stubs (documented, not wired): an Airwallex/Currenxie virtual-account
// FPS payout, or a stablecoin treasury transfer, would implement PaymentRail here
// and be selected via PAYMENT_RAIL env. Left unimplemented on purpose.

let rail: PaymentRail | null = null;

/** The active outbound rail. Defaults to the mock; swap via PAYMENT_RAIL later. */
export function paymentRail(): PaymentRail {
  if (!rail) rail = new MockRail();
  return rail;
}

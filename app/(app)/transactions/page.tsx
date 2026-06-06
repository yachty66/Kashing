import { redirect } from "next/navigation";

// Transactions were merged into the Bookkeeping hub (Transactions tab).
// Keep this route as a redirect so existing links/bookmarks still work.
export default function TransactionsRedirect() {
  redirect("/bookkeeping?tab=transactions");
}

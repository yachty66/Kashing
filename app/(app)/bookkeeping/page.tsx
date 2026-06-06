import { redirect } from "next/navigation";

// The Bookkeeping hub was split back into a standalone Transactions page and a
// Bills page (both under Finance). Keep this route as a redirect to Bills.
export default function BookkeepingRedirect() {
  redirect("/bills");
}

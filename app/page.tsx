import { redirect } from "next/navigation";

// Local-first app: no sign-in. The root just routes you to the default
// feature. When hosted mode ships later, this becomes the landing/sign-in
// page again behind a feature flag.
export default function RootPage() {
  redirect("/overview");
}

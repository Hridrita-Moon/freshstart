import { redirect } from "next/navigation";

/**
 * Root route.
 *
 * The marketing landing page belongs to the `(marketing)` route group
 * (SRS §9.1). Until that page is built, the root redirects into the
 * customer catalogue so the app has a working entry point.
 */
export default function HomePage() {
  redirect("/app/products");
}

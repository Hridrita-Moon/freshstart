import { redirect } from "next/navigation";

/**
 * Customer home.
 *
 * SRS §9.1: `(customer)/app/page.jsx` — Home (browse, featured).
 *
 * For now the home page is the catalogue itself. A dedicated landing page
 * with featured produce belongs with the marketing story; redirecting keeps
 * the customer app usable without duplicating the grid.
 */
export default function CustomerHomePage() {
  redirect("/app/products");
}

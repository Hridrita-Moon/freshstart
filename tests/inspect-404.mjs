// Scratch diagnostic: inspect rendered body text for key routes.
const routes = [
  "/app/products/NO-SUCH-SKU",
  "/app/products/FR-MNG-ALPHONSO",
  "/app/products",
  "/definitely-not-a-route",
];

for (const route of routes) {
  const res = await fetch(`http://localhost:3000${route}`);
  const html = await res.text();
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : "";
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.log(`=== ${route} === status ${res.status} bodyTextLen ${text.length}`);
  console.log(`   ${text.slice(0, 400)}`);
  console.log();
}

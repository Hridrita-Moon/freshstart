function safeRedirectPath(value) {
  if (typeof value !== "string") return "/app/products";
  const candidate = value.trim();
  if (!candidate.startsWith("/")) return "/app/products";
  if (candidate.startsWith("//")) return "/app/products";
  if (candidate.includes("\\")) return "/app/products";
  if (candidate.includes("\n") || candidate.includes("\r")) return "/app/products";
  return candidate;
}

const BS = String.fromCharCode(92);
const cases = [
  "/app/products",
  "//evil.example",
  "/" + BS + BS + "evil.example",
  "/%5C%5Cevil.example",
  "/%2F%2Fevil.example",
  "/%09/evil.example",
  "/app/products%0d%0aLocation:https://evil.example",
  "https://evil.example",
  "/\t/evil.example",
];

for (const c of cases) {
  console.log(JSON.stringify(c), "->", JSON.stringify(safeRedirectPath(c)));
}

// What does the browser/Next decode %5C%5C to when following the path?
console.log("decoded %5C%5C:", decodeURIComponent("/%5C%5Cevil.example"));
console.log("decoded %2F%2F:", decodeURIComponent("/%2F%2Fevil.example"));

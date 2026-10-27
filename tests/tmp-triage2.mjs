import { validateRegisterInput } from "../src/lib/validation/auth.js";

// 1. Password trim asymmetry: what does the register validator actually return?
const padded = validateRegisterInput({
  name: "Test User",
  email: "trim@test.local",
  password: "  tomatoes  ",
});

console.log("register validator password result:", JSON.stringify(padded.data?.password));
console.log("=> register stores the TRIMMED password:", padded.data?.password === "tomatoes");

// 2. safeRedirectPath bypasses — replicate the guard exactly.
const DEFAULT_REDIRECT = "/app/products";
function safeRedirectPath(value) {
  if (typeof value !== "string") return DEFAULT_REDIRECT;
  const candidate = value.trim();
  if (!candidate.startsWith("/")) return DEFAULT_REDIRECT;
  if (candidate.startsWith("//")) return DEFAULT_REDIRECT;
  if (candidate.includes("\\")) return DEFAULT_REDIRECT;
  if (candidate.includes("\n") || candidate.includes("\r")) return DEFAULT_REDIRECT;
  return candidate;
}

for (const v of [
  "/%2f%2fevil.example",
  "/%5C%5Cevil.example",
  "/%09/evil.example",
  "//evil.example",
  "/app/products",
]) {
  console.log(`safeRedirectPath(${JSON.stringify(v)}) ->`, JSON.stringify(safeRedirectPath(v)));
}

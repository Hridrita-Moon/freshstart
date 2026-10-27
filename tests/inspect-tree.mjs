// Scratch diagnostic: print context around a needle in a Next runtime file.
import { readFileSync } from "node:fs";

const file =
  process.argv[2] ??
  "node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js";
const needle = process.argv[3] ?? "resolveErrorDev";
const before = Number(process.argv[4] ?? 1200);
const after = Number(process.argv[5] ?? 1200);

const c = readFileSync(file, "utf8");
let idx = -1;
let count = 0;
while ((idx = c.indexOf(needle, idx + 1)) !== -1) {
  count += 1;
  console.log(`--- @ ${idx} ---`);
  console.log(c.slice(Math.max(0, idx - before), idx + after));
  if (count >= 2) break;
}

// Scratch diagnostic: print module bindings for a compiled app route.
import { readFileSync } from "node:fs";

const file = process.argv[2];
const lines = readFileSync(file, "utf8").split("\n");

for (const [index, line] of lines.entries()) {
  if (!line.includes("MODULE_")) continue;
  console.log(`--- line ${index + 1} (len ${line.length})`);
  const mods = line.match(/MODULE_\d+ => (?:[^"\\]|\\.)*"/g) ?? [];
  for (const m of mods) {
    console.log("  " + m);
  }
  break;
}

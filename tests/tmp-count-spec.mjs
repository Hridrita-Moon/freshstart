import { readFileSync } from "node:fs";

const path = process.argv[2];
const text = readFileSync(path, "utf8");
const words = text.split(/\s+/).filter(Boolean).length;
console.log("chars:", text.length);
console.log("words:", words);
console.log("approx_tokens (chars/4):", Math.round(text.length / 4));
console.log("approx_tokens (words*1.33):", Math.round(words * 1.33));

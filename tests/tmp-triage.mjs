import { hashPassword, verifyPassword } from "../src/lib/auth/password.js";

const long = "a".repeat(80);
const longPlus8 = "a".repeat(80) + "bbbbbbbb";

const hash = await hashPassword(long);

console.log("compare 80-char vs hash-of-80:   ", await verifyPassword(long, hash));
console.log("compare 88-char vs hash-of-80:   ", await verifyPassword(longPlus8, hash));
console.log("=> bcrypt truncates at 72 bytes:", (await verifyPassword(longPlus8, hash)) === true);

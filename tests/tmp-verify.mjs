import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "file:./dev.test.db";
const p = new PrismaClient();

const a = "Case.Test@test.local";
const b = "case.test@test.local";

await p.user.deleteMany({ where: { email: { in: [a, b] } } });

const hash = "$2a$12$notarealhashbutlongenoughxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

try {
  const u1 = await p.user.create({ data: { email: a, passwordHash: hash, name: "A" } });
  const u2 = await p.user.create({ data: { email: b, passwordHash: hash, name: "B" } });
  console.log("BOTH CREATED -> unique index IS case-sensitive.");
  console.log("  ids:", u1.id, "/", u2.id);
} catch (e) {
  console.log("second create FAILED -> unique index is case-insensitive. code:", e.code);
}

console.log("rows with those emails:", await p.user.count({ where: { email: { in: [a, b] } } }));

await p.user.deleteMany({ where: { email: { in: [a, b] } } });
await p.$disconnect();

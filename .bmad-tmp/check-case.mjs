import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const A = "Case.Test@Test.Local";
const B = "case.test@test.local";

async function main() {
  // Clean up anything left over.
  await prisma.user.deleteMany({ where: { email: { in: [A, B] } } });

  await prisma.user.create({
    data: { email: A, passwordHash: "x", name: "Case A" },
  });

  // Now try to register the SAME address in different case via the route's
  // normalisation (which lower-cases). Does the unique index catch it?
  const normalised = B.toLowerCase();

  try {
    await prisma.user.create({
      data: { email: normalised, passwordHash: "x", name: "Case B" },
    });
    console.log("RESULT: second insert SUCCEEDED -> duplicate accounts for one address");
    const rows = await prisma.user.findMany({
      where: { email: { in: [A, B] } },
      select: { email: true },
    });
    console.log("rows:", JSON.stringify(rows));
  } catch (e) {
    console.log("RESULT: second insert rejected ->", e.code);
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: [A, B] } } });
    await prisma.$disconnect();
  }
}

main();

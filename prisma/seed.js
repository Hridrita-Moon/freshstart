/**
 * FreshTrace seed script.
 *
 * SRS §14.3: seeds dev/staging with 1 admin, 2 aggregators, 2 qc_staff,
 * 5 customers, 10 products, 3 active plans, and 20 batches at various tier
 * states. No real PII — every value here is fabricated test data.
 *
 * Run with `npm run db:seed`.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/** Shared password for every seeded account. Development-only. */
const SEED_PASSWORD = process.env.SEED_PASSWORD || "FreshTrace!2026";

/**
 * Products with a shelf life chosen so the seeded batches land in a spread
 * of tiers once the decay engine runs.
 */
const PRODUCTS = [
  {
    sku: "FR-MNG-ALPHONSO",
    name: "Alphonso Mango",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 220,
    description: "Premium Alphonso mangoes harvested from Rajshahi orchards.",
    originDistrict: "Rajshahi",
    harvestToShelfDays: 7,
  },
  {
    sku: "FR-MNG-HIMKOPA",
    name: "Himkopa Mango",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 120,
    description: "Fibre-rich Himkapa mango, the staple Bangladeshi variety.",
    originDistrict: "Rajshahi",
    harvestToShelfDays: 7,
  },
  {
    sku: "FR-ORG-JUMBO",
    name: "Jumbo Orange",
    category: "fruit",
    defaultUnit: "piece",
    baseUnitPrice: 85,
    description: "Seedless Valencia oranges, individually hand-sorted.",
    originDistrict: "Sylhet",
    harvestToShelfDays: 10,
  },
  {
    sku: "FR-ORG-CALAMANSI",
    name: "Calamansi",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 70,
    description: "Small citrus with a sharp, fragrant peel.",
    originDistrict: "Sylhet",
    harvestToShelfDays: 12,
  },
  {
    sku: "FR-VEG-EGG",
    name: "Brinjal (Begun)",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 45,
    description: "Glossy purple brinjal, harvested same day.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 5,
  },
  {
    sku: "FR-VEG-TOMATO",
    name: "Tomato",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 55,
    description: "Vine-ripened tomatoes with high juice content.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 6,
  },
  {
    sku: "FR-VEG-OKRA",
    name: "Okra (Bhindi)",
    category: "vegetable",
    defaultUnit: "kg",
    baseUnitPrice: 90,
    description: "Tender green okra pods, cut daily.",
    originDistrict: "Munshiganj",
    harvestToShelfDays: 4,
  },
  {
    sku: "FR-VEG-GOURD",
    name: "Bottle Gourd (Lau)",
    category: "vegetable",
    defaultUnit: "piece",
    baseUnitPrice: 40,
    description: "Light-green bottle gourd, uniform size.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 8,
  },
  {
    sku: "FR-HER-CORIANDER",
    name: "Coriander (Dhania)",
    category: "other",
    defaultUnit: "bunch",
    baseUnitPrice: 25,
    description: "Fragrant coriander bunches, roots left on for shelf life.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 4,
  },
  {
    sku: "FR-HER-MINT",
    name: "Mint (Pudina)",
    category: "other",
    defaultUnit: "bunch",
    baseUnitPrice: 20,
    description: "Cooling mint bunches for chutney and tea.",
    originDistrict: "Dhaka",
    harvestToShelfDays: 3,
  },
];

const AGGREGATORS = [
  {
    email: "aggregator.mogra@freshtrace.test",
    name: "Nadia Haque",
    companyName: "Mogra Valley Farms",
    phone: "+8801700000001",
    districts: ["Dhaka", "Munshiganj", "Rajshahi"],
  },
  {
    email: "aggregator.sylhet@freshtrace.test",
    name: "Rahim Chowdhury",
    companyName: "Sylhet Highland Growers",
    phone: "+8801700000002",
    districts: ["Sylhet", "Chattogram"],
  },
];

const QC_STAFF = [
  { email: "qc.rafiq@freshtrace.test", name: "Rafiq Islam", phone: "+8801800000001" },
  { email: "qc.sumaiya@freshtrace.test", name: "Sumaiya Akter", phone: "+8801800000002" },
];

const CUSTOMERS = [
  { email: "customer.tareq@freshtrace.test", name: "Tareq Mahmud", phone: "+8801900000001" },
  { email: "customer.nusrat@freshtrace.test", name: "Nusrat Jahan", phone: "+8801900000002" },
  { email: "customer.sakib@freshtrace.test", name: "Sakib Al Hasan", phone: "+8801900000003" },
  { email: "customer.mehjabin@freshtrace.test", name: "Mehjabin Rahman", phone: "+8801900000004" },
  { email: "customer.arif@freshtrace.test", name: "Arif Hossain", phone: "+8801900000005" },
];

const PLANS = [
  {
    name: "Couple Weekly",
    basketSize: "small",
    weeklyPrice: 650,
    description: "A small weekly basket of seasonal fruit and vegetables.",
    composition: [],
  },
  {
    name: "Family Weekly",
    basketSize: "medium",
    weeklyPrice: 1200,
    description: "A medium basket covering everyday household cooking.",
    composition: [],
  },
  {
    name: "Family Premium",
    basketSize: "large",
    weeklyPrice: 1850,
    description: "A large basket with premium fruit and a wider vegetable mix.",
    composition: [],
  },
];

/** Milliseconds in a day. */
const MS_PER_DAY = 86_400_000;

/** Dhaka's fixed offset from UTC: +06:00. */
const DHAKA_OFFSET_MS = 6 * 3_600_000;

/**
 * Build a Date for a given number of days ago, at midnight Dhaka time.
 *
 * @param {number} daysAgo
 * @returns {Date}
 */
function daysAgoAtDhakaMidnight(daysAgo) {
  const now = Date.now();
  const shifted = new Date(now + DHAKA_OFFSET_MS);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - DHAKA_OFFSET_MS - daysAgo * MS_PER_DAY);
}

/**
 * Short, URL-safe slug used in the printed QR code.
 *
 * @returns {string}
 */
function randomSlug(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Human-readable batch code, e.g. `FT-MNG-2026-10-09-A1`.
 *
 * @param {string} sku
 * @param {Date} harvestDate
 * @param {number} sequence
 * @returns {string}
 */
function batchCode(sku, harvestDate, sequence) {
  const shortSku = sku.replace(/^FR-/, "").split("-")[0].slice(0, 3).toUpperCase();
  const y = harvestDate.getUTCFullYear();
  const m = String(harvestDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(harvestDate.getUTCDate()).padStart(2, "0");
  return `FT-${shortSku}-${y}-${m}-${d}-${sequence}`;
}

/**
 * Seed a set of batches spread across the freshness tiers.
 *
 * The offsets are chosen relative to "today" so the demo always shows a
 * spread of fresh, good, fair, near-expiry and expired batches.
 */
const BATCH_PLAN = [
  // { productIndex, daysAgo, status, qcStatus, tier, multiplier, inboundQty, soldFraction }
  { productIndex: 0, daysAgo: 0, status: "listed", qcStatus: "passed", tier: "fresh", multiplier: 1.0, inboundQty: 120 },
  { productIndex: 0, daysAgo: 3, status: "listed", qcStatus: "passed", tier: "good", multiplier: 0.8, inboundQty: 90 },
  { productIndex: 0, daysAgo: 5, status: "listed", qcStatus: "passed", tier: "fair", multiplier: 0.6, inboundQty: 60 },
  { productIndex: 1, daysAgo: 7, status: "listed", qcStatus: "passed", tier: "near_expiry", multiplier: 0.3, inboundQty: 75 },
  { productIndex: 1, daysAgo: 9, status: "delisted", qcStatus: "passed", tier: "expired", multiplier: 0.0, inboundQty: 45 },

  { productIndex: 2, daysAgo: 1, status: "listed", qcStatus: "passed", tier: "fresh", multiplier: 1.0, inboundQty: 200 },
  { productIndex: 2, daysAgo: 4, status: "listed", qcStatus: "passed", tier: "fair", multiplier: 0.6, inboundQty: 150 },
  { productIndex: 2, daysAgo: 11, status: "delisted", qcStatus: "passed", tier: "expired", multiplier: 0.0, inboundQty: 80 },

  { productIndex: 3, daysAgo: 2, status: "listed", qcStatus: "passed", tier: "good", multiplier: 0.8, inboundQty: 40 },
  { productIndex: 3, daysAgo: 12, status: "sold_out", qcStatus: "passed", tier: "near_expiry", multiplier: 0.3, inboundQty: 35 },

  { productIndex: 4, daysAgo: 0, status: "listed", qcStatus: "passed", tier: "fresh", multiplier: 1.0, inboundQty: 65 },
  { productIndex: 4, daysAgo: 2, status: "listed", qcStatus: "passed", tier: "good", multiplier: 0.8, inboundQty: 50 },
  { productIndex: 4, daysAgo: 4, status: "listed", qcStatus: "passed", tier: "fair", multiplier: 0.6, inboundQty: 30 },

  { productIndex: 5, daysAgo: 1, status: "listed", qcStatus: "passed", tier: "fresh", multiplier: 1.0, inboundQty: 110 },
  { productIndex: 5, daysAgo: 3, status: "listed", qcStatus: "passed", tier: "good", multiplier: 0.8, inboundQty: 95 },
  { productIndex: 5, daysAgo: 6, status: "listed", qcStatus: "passed", tier: "near_expiry", multiplier: 0.3, inboundQty: 40 },

  { productIndex: 6, daysAgo: 0, status: "listed", qcStatus: "passed", tier: "fresh", multiplier: 1.0, availableFraction: 0.4, inboundQty: 25 },
  { productIndex: 6, daysAgo: 5, status: "in_transit", qcStatus: "pending", tier: null, multiplier: 1.0, inboundQty: 30 },
  { productIndex: 6, daysAgo: 6, status: "in_transit", qcStatus: "failed", tier: null, multiplier: 1.0, inboundQty: 22 },

  { productIndex: 7, daysAgo: 2, status: "listed", qcStatus: "passed", tier: "good", multiplier: 0.8, inboundQty: 150 },
  { productIndex: 7, daysAgo: 5, status: "listed", qcStatus: "passed", tier: "fair", multiplier: 0.6, inboundQty: 120 },
];

/**
 * Delete all rows in an order that respects foreign-key constraints.
 */
async function clearAll() {
  await prisma.refundItem.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.batchQcLog.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hubClosure.deleteMany();
}

async function main() {
  console.log("🌱 Seeding FreshTrace development data...\n");

  await clearAll();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  console.log(`   Password for all seeded accounts: "${SEED_PASSWORD}"\n`);

  // ── Admin ────────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: process.env.SEED_ADMIN_EMAIL || "admin@freshtrace.test",
      passwordHash,
      name: "FreshTrace Admin",
      role: "admin",
      status: "active",
      lastLoginAt: new Date(),
    },
  });
  console.log(`   ✓ admin            ${admin.email}`);

  // ── Aggregators ──────────────────────────────────────────────────────────
  const aggregators = [];
  for (const agg of AGGREGATORS) {
    const created = await prisma.user.create({
      data: {
        email: agg.email,
        passwordHash,
        name: agg.name,
        phone: agg.phone,
        role: "aggregator",
        status: "active",
        companyName: agg.companyName,
        districts: JSON.stringify(agg.districts),
        lastLoginAt: new Date(),
      },
    });
    aggregators.push(created);
    console.log(`   ✓ aggregator       ${created.email}`);
  }

  // ── QC staff ─────────────────────────────────────────────────────────────
  const qcStaff = [];
  for (const member of QC_STAFF) {
    const created = await prisma.user.create({
      data: {
        email: member.email,
        passwordHash,
        name: member.name,
        phone: member.phone,
        role: "qc_staff",
        status: "active",
        lastLoginAt: new Date(),
      },
    });
    qcStaff.push(created);
    console.log(`   ✓ qc_staff         ${created.email}`);
  }

  // ── Customers ────────────────────────────────────────────────────────────
  const customers = [];
  for (const customer of CUSTOMERS) {
    const created = await prisma.user.create({
      data: {
        email: customer.email,
        passwordHash,
        name: customer.name,
        phone: customer.phone,
        role: "customer",
        status: "active",
        lastLoginAt: new Date(),
      },
    });
    customers.push(created);
  }
  console.log(`   ✓ customers        ${customers.length} created`);

  // ── Products ─────────────────────────────────────────────────────────────
  const products = [];
  for (const product of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        defaultUnit: product.defaultUnit,
        baseUnitPrice: product.baseUnitPrice,
        description: product.description,
        originDistrict: product.originDistrict,
        harvestToShelfDays: product.harvestToShelfDays,
        isActive: true,
        imageUrl: null,
      },
    });
    products.push(created);
  }
  console.log(`   ✓ products         ${products.length} created`);

  // ── Subscription plans ───────────────────────────────────────────────────
  const plans = [];
  for (const plan of PLANS) {
    const created = await prisma.subscriptionPlan.create({
      data: {
        name: plan.name,
        basketSize: plan.basketSize,
        weeklyPrice: plan.weeklyPrice,
        description: plan.description,
        composition: JSON.stringify(
          plan.composition.length > 0
            ? plan.composition
            : products.slice(0, 4).map((p) => ({ productId: p.id, defaultQty: 1 })),
        ),
        isActive: true,
      },
    });
    plans.push(created);
  }
  console.log(`   ✓ subscription plans ${plans.length} created`);

  // ── Batches ──────────────────────────────────────────────────────────────
  let batchCount = 0;
  for (const [index, spec] of BATCH_PLAN.entries()) {
    const product = products[spec.productIndex];
    const aggregator = aggregators[index % aggregators.length];
    const harvestDate = daysAgoAtDhakaMidnight(spec.daysAgo);

    // A batch's shelf life runs from harvest; `expiresAt` is the expiry point.
    const expiresAt = new Date(
      harvestDate.getTime() + product.harvestToShelfDays * MS_PER_DAY,
    );

    const availableQty =
      spec.availableFraction !== undefined
        ? spec.inboundQty * spec.availableFraction
        : spec.status === "sold_out"
          ? 0
          : spec.inboundQty;

    const sequence = (index % 9) + 1;

    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: batchCode(product.sku, harvestDate, sequence),
        qrSlug: randomSlug(),
        harvestDate,
        originDistrict: product.originDistrict || "Dhaka",
        inboundQty: spec.inboundQty,
        availableQty,
        qcStatus: spec.qcStatus,
        currentTier: spec.tier,
        currentPriceMultiplier: spec.multiplier,
        status: spec.status,
        inboundAt: new Date(harvestDate.getTime() + 12 * 3_600_000),
        listedAt:
          spec.status === "listed" || spec.status === "sold_out"
            ? new Date(harvestDate.getTime() + 18 * 3_600_000)
            : null,
        expiresAt,
      },
    });

    // QC logs for batches that have been inspected.
    if (spec.qcStatus === "passed" || spec.qcStatus === "failed") {
      await prisma.batchQcLog.create({
        data: {
          batchId: batch.id,
          inspectorId: qcStaff[index % qcStaff.length].id,
          inspectedAt: new Date(harvestDate.getTime() + 14 * 3_600_000),
          grade: spec.qcStatus === "passed" ? "A" : "C",
          weightKg: spec.inboundQty * 0.98,
          temperatureC: 22 + (index % 5),
          passed: spec.qcStatus === "passed",
          notes:
            spec.qcStatus === "passed"
              ? "Visual inspection passed; no bruising or pest damage."
              : "Significant bruising found at intake. Batch rejected.",
          photos: JSON.stringify([]),
        },
      });
    }

    batchCount += 1;
  }
  console.log(`   ✓ batches          ${batchCount} created`);

  // ── Addresses for customers (needed by future subscription stories) ──────
  for (const [index, customer] of customers.entries()) {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: "Home",
        line1: `House ${10 + index}, Road ${5 + index}`,
        line2: index % 2 === 0 ? "Flat 4B" : null,
        area: ["Gulshan-2", "Dhanmondi-27", "Banani-11", "Uttara Sector-4", "Mirpur-10"][index],
        city: "Dhaka",
        isDefault: true,
      },
    });
  }
  console.log(`   ✓ addresses        ${customers.length} created`);

  console.log("\n✅ Seed complete.\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

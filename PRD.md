# FreshTrace — Product Requirements Document

**Status:** v0.2 — pre-pre-pilot
**Owner:** Founding team (Technical Co-founder, Business/Ops Co-founder)
**Last updated:** 2026-10-26

> **Note on this document.** This PRD is the output of a structured product-decision process. The original one-page project brief (`FreshTrace_Project_Brief.pdf`) proposed a sensor-based B2B quality-intelligence system. After review, the founding team chose a different shape: a hybrid farm-to-table e-commerce marketplace with a freshness-intelligence supporting layer, and a concierge-MVP pilot-first build sequence. This PRD reflects the *revised* product, not the brief as originally written. The brief should be updated to match this document before any external use.

> **Note on cost inputs.** Several Bangladesh-specific cost numbers (warehouse rent, last-mile courier rates, payment-gateway fees, household produce spend, cold-chain transport, aggregator margins) are marked "**team to verify**" throughout this document. They were not invented. They are the *named unknowns* the team must close in Phase 0 (pre-pilot) before the 90-day pilot can start.

---

## 1. Executive Summary

FreshTrace is a Dhaka-based farm-to-table e-commerce platform that sells curated weekly baskets of fresh produce to urban households, with a freshness-intelligence and provenance layer built on top of an in-city Quality Control (QC) hub. The product is a hybrid: the **e-commerce marketplace is the core**, the **freshness intelligence and B2B data service are supporting layers**.

v1 is a **lean marketplace**: a mobile-responsive web app for customers, a partner/aggregator dashboard, an admin/QC operations panel, and basic QR-based product pages showing origin and freshness. v1 deliberately excludes native mobile apps, a B2B data API, and a complex ML pricing engine.

The product is validated through a **90-day concierge pilot** (Phase 1) with 30–50 families in Gulshan, Banani, and Uttara, operating manually against pre-committed success criteria. The v1 build (Phase 2) is funded only if the pilot passes its go/no-go gate.

**Target at 12 months:** 500 active subscribers in the launch neighborhoods, ≥ 25% gross margin per basket, < 5% refund rate, QC pass rate ≥ 80%, NPS > 30.

---

## 2. Problem & Opportunity

**Problem.** Urban working professionals and families (age 25–45) in Dhaka, Bangladesh, want fresh, traceable, chemical-free produce but lack time to shop daily at wet markets (kacha bazar). Their current alternatives are (a) street vendors, who offer no quality assurance or traceability, and (b) superstores (Swapno, Unimart, Daily Shopping), which charge premium prices for packaged produce without guaranteed freshness or origin.

**Opportunity.** A subscription-based, premium-traceable produce basket delivered to the door, with verified origin, verified harvest date, and a visible freshness tier, can capture a real segment of affluent-but-not-elite Dhaka households. The same operational footprint (the QC hub) enables a future B2B freshness-intelligence service to the platform's own seller network.

**Why now.** Bangladesh has experienced multiple high-profile produce-adulteration and food-safety news cycles. Trust in produce sourcing is a real, active consumer concern. Aggregator and cooperative networks in producing districts (Jashore, Bogura, Rangpur, Rajshahi) exist and consolidate supply, but lack a direct consumer channel. Last-mile courier infrastructure (Pathao, Steadfast) is mature enough to support a weekly-subscription delivery model.

---

## 3. Target Customer & Geography

### 3.1 Primary customer

- **Demographic:** urban working professionals and families, age 25–45.
- **Geography:** Dhaka Metropolitan Area, initially **Gulshan, Banani, Uttara, Dhanmondi, Mirpur, Lalmatia**.
- **Current behavior:** weekly visits to wet markets or superstores; some reliance on street vendors for daily top-ups.
- **Willingness to pay:** premium-traceable price band (BDT 1,200–1,800 per weekly basket, ~4–5 kg, 6–8 SKUs).
- **Switch triggers (in order of importance):**
  1. **Convenience and subscription** — a frictionless, scheduled weekly delivery at a known time.
  2. **Provenance and freshness** — verified origin, harvest date, and freshness tier, surfaced at the point of purchase and on a scannable QR code on the delivered basket.
  3. **Quality assurance** — standardized grading at a physical QC hub and a clear refund/replacement policy for damaged items.

### 3.2 Geographic scope (v1)

- **In scope (v1):** Dhaka North City Corporation and Dhaka South City Corporation metropolitan area.
- **High-priority hubs (v1):** Gulshan, Banani, Uttara, Dhanmondi, Mirpur, Lalmatia.
- **Explicitly out of scope (v1):** outer metro fringes (Gazipur, Narayanganj) and all other divisional cities. Phase 2 expansion decision follows Gate E (Section 9).

### 3.3 Why Dhaka first

Dhaka is the largest and densest metro in Bangladesh, has the highest concentration of the 25–45 affluent-professional segment, has established incumbent competitors (Swapno, Unimart, Daily Shopping) whose market the product directly addresses, and has mature last-mile courier coverage. Density is the dominant variable in last-mile produce economics; proving the model in Dhaka first buys the right to expand, and the expansion goes faster because it is informed by real Dhaka data.

---

## 4. Product Concept

FreshTrace is a **hybrid e-commerce + freshness-intelligence platform**. The product has three layers, of which only the first is built in v1.

| Layer | Description | v1 status |
|---|---|---|
| **Core: E-commerce marketplace** | Customers browse, subscribe to, and reorder curated weekly produce baskets. Aggregators list batches with mandatory metadata (harvest date, origin district, batch ID). A physical QC hub receives shipments, verifies them, and the QC findings are logged into the admin panel and trigger dynamic tiered pricing. | **Built in v1.** |
| **Supporting: Freshness intelligence** | Public-facing product pages (linked via QR on the delivered basket) showing origin, harvest date, freshness tier, and supply-chain journey for each batch. | **Built in v1** (basic, rule-based). |
| **Future: B2B data service** | Freshness and provenance data sold to upstream sellers (cooperatives, aggregators on the platform) as a benchmarking service. May also serve downstream retail buyers in a later phase. | **Not built in v1.** See Section 5.3. |

**Why this product shape:** the e-commerce marketplace is the customer-acquisition engine and the operational data generator. The freshness intelligence is the *visible differentiator* that converts a trial customer into a repeat customer. The B2B data service is the long-term revenue diversification, but it requires real marketplace data to be credible; it is therefore deliberately deferred to v2.

**Why freshness is the moat, not traceability:** provenance chains (GS1 EPCIS, blockchain-ledger provenance, etc.) are increasingly table-stakes and easy to imitate. The hard, defensible, hard-to-replicate thing is *operational freshness* — a verified harvest date backed by physical QC at a hub you actually run. Traceability is the substrate; freshness is the product.

---

## 5. Product Scope

### 5.1 v1 — In scope (Lean Marketplace + 1 Hub)

**Customer-facing:**
- Mobile-responsive web marketplace (Next.js App Router, JavaScript, Tailwind CSS v4).
- Product browsing, search, basket details, freshness tier display, origin display.
- Subscription management (weekly recurring baskets; tier selection; pause / cancel).
- One-off ordering (in addition to subscription).
- Order tracking, refund / replacement request flow.
- Public QR product pages (web) showing origin, harvest date, freshness tier, and supply-chain journey.
- Customer support via in-app messaging and WhatsApp fallback during v1.

**Partner / Aggregator-facing:**
- Web dashboard for partner aggregators to list batches, set inventory, and input mandatory metadata (harvest date, origin district, batch ID).
- Batch lifecycle view (listed → in-transit → received at hub → QC-passed → listed to consumer → sold-out / delisted).

**Admin / QC-facing:**
- Admin and QC operations panel.
- QC inspection logging (visual grade, weight, temperature if logged, notes, photos).
- Real-time freshness tier recalculation based on logged harvest date and QC timestamp.
- Dynamic tiered pricing engine (rule-based: Day 1 @ 100%, Day 3 @ 80%, Day 5 @ 60%, Day 7 delist).
- Refund and replacement management.
- Reporting (orders, gross margin per basket, refund rate, QC pass rate, spoilage rate).

**Hub operations (physical):**
- One QC hub in Dhaka (Uttara or Mohammadpur — final site TBD in Phase 0).
- Receiving area, basic cold room, inspection bench.
- Receiving → QC → list-to-consumer workflow, all logged in the admin panel.

**Integrations (v1):**
- **Local mock Stripe checkout.** Checkout is built against the Stripe Checkout API shape but runs entirely against a local, in-process mock — no Stripe account, API keys, or network calls. Orders are created as `PENDING` and moved to `PAID` by a local simulated payment confirmation step. This keeps the full checkout UX (cart → checkout → order confirmation) buildable and testable before a real merchant account exists. A real Stripe account and live keys remain a Phase 0 procurement item; swapping the mock for live Stripe is a contained change because the payment provider boundary is kept behind a single module.
- Last-mile delivery via Pathao and/or Steadfast, with tariff terms negotiated in Phase 0.
- QR code generation (per batch, links to public product page).

> **Why a mock gateway in v1.** The pilot's critical path is *checkout that works*, not *payment rails that settle*. A local mock removes merchant onboarding (BDT/company paperwork, settlement accounts) from the engineering critical path while preserving the order-state machine, refunds, and reconciliation logic. The commercial reality (bKash/Nagad/card coverage in Bangladesh, SSLCOMMERZ or Stripe Bangladesh availability) is a Phase 0 business task, not an architecture constraint.

### 5.2 v1 — Explicit non-goals

The following are **deliberately not in v1**. Including them now would burn capital before the marketplace has proven repeat purchase at unit-economic-positive margin.

- No native iOS or Android consumer app. (Mobile-responsive web is sufficient at v1 scale.)
- No native partner/aggregator app. (Web dashboard only.)
- No B2B data API or external B2B dashboard. (Internal-only data in v1.)
- No complex ML-based dynamic pricing. (Rule-based tiered pricing only.)
- No second QC hub. (One hub is the operational constraint that forces the model to be repeatable before scaling.)
- No expansion beyond the v1 hubs. (Dhanmondi, Mirpur, Lalmatia are in scope; nothing else.)
- No organic certification program. (The product is "traceable" and "premium," not formally "certified organic," in v1.)
- No loyalty / referral / gamification features. (Acquisition is network-driven in v1.)
- No advanced analytics dashboards. (Reporting sufficient for ops decisions in v1.)

### 5.3 v2 / v3 — Out of scope for this document

Listed here only so the *absence* is explicit. These are decisions for a later PRD.

- **v2 candidates:** native iOS/Android consumer app (if subscription habits justify push-driven engagement); second QC hub (Dhanmondi or Mirpur site); expansion to Dhanmondi/Mirpur as a separate launch (already in the v1 hub list, but as a market, not a separate hub); price-tier expansion (small, family, premium-organic); basic ML-based pricing (replacing the rule-based engine).
- **v3 candidates:** B2B freshness-intelligence API (sold to platform sellers first, then potentially external buyers); expansion outside Dhaka (Gazipur, Narayanganj, then other divisional cities); international export pilot (B2B, with a specific anchor buyer identified through due diligence).

---

## 6. Pre-Pilot Phase (Phase 0)

**Duration:** 4 weeks before the 90-day pilot begins.
**Gate A (must pass before pilot starts):**
- Pilot unit-cost model is complete and signed off.
- 1-week pre-pilot dry run has been completed; QC pass rate and spoilage rate are logged.
- 1 primary aggregator (Jashore or Bogura cooperative / fruit supplier, team-network-sourced) plus 1–2 fallback aggregator agreements are signed (LOI minimum).
- At least one QC hub candidate site has been identified in Uttara or Mohammadpur with a quoted monthly rent.

### 6.1 Pilot unit-cost model (mandatory)

Built as a per-basket cost stack, in a spreadsheet, with every line item assigned either a real number (vendor quote, salary assumption, or observed measurement) or a "needs vendor input by [date]" status.

| # | Component | Source of truth | Status (to be filled in Phase 0) |
|---|---|---|---|
| 1 | Produce cost (paid to aggregator) | Quote from Jashore/Bogura cooperative | **Team to verify** |
| 2 | Aggregator margin | Bundled in #1 typically | **Team to verify** |
| 3 | Inbound transport (cooperative → Dhaka hub) | Quote from transport provider | **Team to verify** |
| 4 | QC hub labor (2–4 staff) | Salary assumptions | **Team to verify** |
| 5 | Hub facility + cold room | Quoted rent (Uttara / Mohammadpur) | **Team to verify** |
| 6 | Packaging | Easy to estimate | Estimable today |
| 7 | Last-mile delivery | Tariff quote from Pathao/Steadfast (3–5 kg, Gulshan/Uttara) | Estimable today (quotes needed) |
| 8 | Payment gateway fees | SSLCOMMERZ/Stripe — 1.5–2% (assumed; mock gateway in v1 incurs none) | Known (1.5–2%) |
| 9 | Spoilage / waste | Measured in pre-pilot dry run | **Team to measure (Phase 0)** |
| 10 | Customer refunds / replacements | Pilot refund rate | **Team to measure (Phase 0)** |
| 11 | **Total unit cost** | Sum of 1–10 | — |
| 12 | **Contribution margin per basket** | Price (BDT 1,200–1,800) − #11 | — |

> **Cost-input honesty note.** All Bangladesh-specific cost numbers above (rent ranges, courier rates, aggregator margins, cold-chain transport costs) were **not invented** for this document. The drafting session had no web access. They are to be sourced from real vendor quotes, real BBS HIES data, and real Dhaka broker listings during Phase 0. The cost-model spreadsheet, when complete, is the single most important pre-pilot artifact.

### 6.2 Pre-pilot dry run (1 week)

A small operational test before the formal 90-day pilot. Estimated cost: BDT 15,000–20,000. Purpose: convert the biggest unknown (spoilage) into a known number.

- Source 150–250 kg of mixed produce through the planned aggregator channel.
- Receive at a temporary QC area (does not need to be the final hub).
- Inspect and log QC pass / fail rate, weight loss, visible spoilage.
- Measure actual waste percentage against the cost-model assumption.
- If dry-run spoilage > 15%, escalate to founding team before pilot start; the pilot is a money-loser on its planned unit economics.

### 6.3 Other Phase 0 deliverables

- QC hub candidate site identified (Uttara or Mohammadpur) with quoted rent and signed short-term lease.
- Payment gateway decision closed: Stripe account opened (preferred) **or** SSLCOMMERZ/bKash/Nagad merchant account opened. The v1 build itself is not blocked on this — the mock gateway ships first and the live provider is swapped in behind the same module boundary.
- 1 primary + 1–2 fallback aggregator LOIs signed.
- Customer-acquisition channel validated: the 30–50 family network is confirmed (named, not just "we know people").
- Pilot pricing confirmed at BDT 1,200–1,800 weekly basket; pilot basket composition (~4–5 kg, 6–8 SKUs) confirmed.

---

## 7. Pilot Plan (Phase 1)

**Duration:** 90 days.
**Geography:** Gulshan, Banani, Uttara (with Dhanmondi/Mirpur/Lalmatia as natural extensions if the network extends there organically).
**Form:** Concierge MVP. Manual and semi-manual operations. No native app. WhatsApp for order intake and customer support during the pilot.
**Scale:** 30–50 paying families by week 6, growing to 40+ active by end of pilot.
**Price band:** BDT 1,200–1,800 per weekly basket (~4–5 kg, 6–8 SKUs, premium-traceable positioning).
**Acquisition channel:** warm network and direct referrals. No paid ads in pilot.

### 7.1 Pilot operations

- **Sourcing:** primary aggregator (Jashore/Bogura cooperative, team-network-sourced) delivers to the QC hub weekly; 1–2 fallback aggregators on standby.
- **QC hub:** 1 facility (Uttara or Mohammadpur); 2–4 staff; basic cold room; inspection bench.
- **QC workflow:** receive → inspect → log harvest date, weight, grade, photos → update freshness tier → list to consumer.
- **Fulfillment:** basket packed at hub; same-day or next-day delivery to customer; last-mile via Pathao/Steadfast or in-house rider.
- **Pricing:** rule-based tiered pricing applied per day-from-harvest (Day 1 @ 100%, Day 3 @ 80%, Day 5 @ 60%, Day 7 delist).
- **Refunds / replacements:** clear policy communicated to pilot customers; logged in admin panel; tracked as a pilot success metric.

### 7.2 Pilot success criteria (pre-committed, measured weekly)

| # | Metric | "Pilot worked" target | "Pivot or stop" trigger |
|---|---|---|---|
| 1 | Reorder rate (3rd order within 60 days) | ≥ 60% | < 40% |
| 2 | Active customers at end of week 12 | ≥ 40 with 2+ orders | < 20 |
| 3 | Average weekly basket size (BDT) | ≥ 1,400 | < 1,100 |
| 4 | Pilot gross margin per basket (after all variable costs, before hub fixed cost) | ≥ 25% | < 10% |
| 5 | QC pass rate at hub | ≥ 80% | < 60% |
| 6 | Refund / replacement rate | < 5% of baskets | > 12% |
| 7 | Customer acquisition cost (CAC) | < BDT 500 | > BDT 1,500 |

**Diagnostic (not a hard gate):**
- NPS / "would recommend" score: > 30 (very good) / 0–30 (mixed) / < 0 (bad).
- Top non-reorder reason (qualitative): should converge on 2–3 named reasons by week 8.

### 7.3 Gate B (pilot → v1 build)

The v1 build (Phase 2) begins only if ≥ 5 of 7 success criteria are met, with **all three of the following critical metrics at or above target**:
- Reorder rate (#1)
- Gross margin per basket (#4)
- QC pass rate (#5)

If Gate B is missed on the critical metrics, the founding team commits to a documented pivot-or-stop decision before Phase 2 begins. A "soft pass" (5 of 7 with weakness in non-critical metrics) is acceptable; a "soft pass" with weakness in any critical metric is not.

---

## 8. v1 Build Plan (Phase 2)

**Duration:** 90 days after Gate B passes.
**Gate C (v1 launch readiness):** internal alpha live, all 4 core flows tested end-to-end (order, fulfillment, payment, QC), 5 pilot customers migrated from WhatsApp to web app, 1 week's data on QC pass rate at production traffic.

### 8.1 Technology stack (v1)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router) | Mobile-responsive web; SSR for SEO and product pages; one deployable unit instead of separate frontend/backend services |
| Language | JavaScript (`.js` / `.jsx`) | Team fluency and velocity; no separate type-checking step. JSDoc annotations used where types aid clarity |
| Styling | Tailwind CSS v4 (CSS-first `@theme` config) | Utility-first, fast iteration; v4's native engine removes the legacy `tailwind.config.js` indirection |
| UI primitives | HeroUI (React) | Accessible, composable components that wrap Tailwind cleanly; avoids hand-rolling form/dialog/table primitives |
| Data access | Prisma ORM | Typed-by-schema client over the database; first-class migrations and seed tooling |
| Database | **SQLite** (local file, via Prisma) | Zero-ops single-file database; sufficient for a single-hub pilot. Relational integrity suits orders/batches/stock. Migration path to Postgres exists if the team outgrows it |
| Backend / API | **Next.js Route Handlers** (App Router `app/api/*`) | No separate Express server — domain logic runs server-side in the same Next.js process, removing an entire deployment tier and the network hop between UI and API |
| Auth | **Custom lightweight session auth** | Database-backed sessions + httpOnly cookie. Better Auth has been **removed** from the stack: its plugin/adapter surface is unnecessary for four roles and a single-provider model, and it would add a dependency to a project already leaning deliberately small |
| Hosting | Vercel (single Next.js app) | Low ops overhead; matches v1 team size and the single-deployable-unit architecture |
| Payments | **Local mock Stripe checkout** | Stripe-compatible local checkout module; no merchant account, keys, or network calls required to build and demo the full checkout flow |
| QR | Server-generated per batch; links to public product page | Simple, no third-party QR service required |

> **Stack-change rationale.** The v1 architecture is a **single Next.js application** — no separate Express backend, no MongoDB Atlas, no managed Redis. All three were removed because a 30–50 family pilot running one hub does not justify the operational surface of a distributed backend, and because every one of them added failure modes (network hop, replica lag, cross-service session sharing) that the product does not need. SQLite via Prisma gives relational integrity, migrations, and a generated client with none of the infrastructure.

### 8.2 v1 team shape

| Role | Count | Full-time / part-time |
|---|---|---|
| Technical co-founder (full-stack engineer, Next.js / Prisma) | 1 | Full-time |
| Business / Ops co-founder (QC hub + supply chain + Dhaka ops) | 1 | Full-time |
| Engineers (frontend / backend, supporting tech co-founder) | 3–5 | Full-time |
| Operations lead (delivery coordination, customer support, refund ops) | 1 | Full-time |
| QC lead (hub staff supervision, QC workflow design) | 1 | Full-time |
| **Total v1 team** | **7–9** | **All full-time** |

### 8.3 v1 budget envelope

- 6 months of runway: **BDT 80–120 lakh total**.
- Composition: team salaries, QC hub rent and operating cost (including cold room), software tooling, marketing (limited to network-driven, not paid), contingency.
- Source: bootstrapped / friends-and-family capital, committed or in active discussion.

---

## 9. Roadmap & Milestones

**12-month roadmap, 5 phases, with explicit go/no-go gates.**

| Phase | Months | Activity | Gate at end |
|---|---|---|---|
| **0 — Pre-pilot** | Month 0, weeks 1–4 | Build unit-cost model; lock 1–2 aggregator agreements; scout 2–3 hub sites; run 1-week dry run; open payment merchant account; confirm pilot customer network | **Gate A:** cost model complete, dry run done, 2 aggregator LOIs signed, ≥ 1 hub site with quoted rent, pilot network confirmed |
| **1 — Pilot** | Month 1–3 (90 days) | Concierge MVP, 30–50 families, manual/semi-manual, 1 hub, 1 aggregator, BDT 1,200–1,800 baskets, network acquisition, weekly measurement against 7 success criteria + 2 diagnostics | **Gate B:** ≥ 5 of 7 success criteria hit, with reorder rate, gross margin, and QC pass rate all at or above target |
| **2 — v1 build** | Month 4–6 (90 days) | Lean v1 build: customer web app, aggregator dashboard, admin/QC panel, basic QR product pages, mock Stripe checkout integration, subscription management, rule-based pricing engine. Next.js App Router (JavaScript) + Prisma/SQLite + Tailwind v4 on Vercel. | **Gate C:** internal alpha live, 4 core flows tested end-to-end, 5 pilot customers migrated, 1 week of production QC data |
| **3 — v1 launch** | Month 7–9 | Open v1 to pilot customers + their network referrals. Network-driven acquisition. Target: 200 active subscribers by end of month 9. | **Gate D:** 200 active subscribers, gross margin ≥ 25%, refund rate < 8% |
| **4 — v1 scale** | Month 10–12 | Continue v1 operations, drive toward 500 active subscribers. Iterate on product from diagnostic signals. | **Gate E:** 500 active subscribers, gross margin ≥ 25%, refund rate < 5%, NPS > 30 |

**v2 decision at Gate E:** whether to build the native consumer app, open a second QC hub, expand the market to Dhanmondi/Mirpur as a separate launch, or begin the B2B freshness-intelligence service. Decision is made on actual v1 data, not in advance.

---

## 10. Team & Funding

### 10.1 Founding team (committed for v1)

- **Technical co-founder:** full-stack engineer, Next.js/Prisma, leads the v1 build and platform engineering.
- **Business / Ops co-founder:** leads Dhaka QC hub operations, aggregator relationships, supply chain, and pilot operations.

### 10.2 Funding (committed / in active discussion)

- **Source:** bootstrapped / friends-and-family.
- **Amount:** BDT 80–120 lakh.
- **Use:** 6 months of v1 team salaries + QC hub operating cost + tooling + contingency.
- **Status:** committed or in active discussion at PRD publication. To be closed before Phase 1 (pilot) starts.

### 10.3 Future funding (out of scope for this document)

- Series A / seed VC consideration is a Gate E decision, contingent on v1 reaching 500 active subscribers and unit-economic-positive gross margin.

---

## 11. Success Metrics (v1, 12-month endpoint)

| # | Metric | Target at Gate E (month 12) |
|---|---|---|
| 1 | Active subscribers in Gulshan / Banani / Uttara | ≥ 500 |
| 2 | Gross margin per basket | ≥ 25% |
| 3 | Refund / replacement rate | < 5% |
| 4 | QC pass rate at hub | ≥ 80% |
| 5 | Customer acquisition cost (CAC) | < BDT 1,000 |
| 6 | NPS (diagnostic) | > 30 |

**Note on metric drift between pilot and v1:** CAC target relaxes from BDT 500 (pilot, network-only) to BDT 1,000 (v1, mixed network + light paid acquisition) because v1 is no longer purely network-driven. Refund rate threshold tightens from < 5% to < 5% (unchanged) at Gate E because at higher volume, operational discipline is expected to improve.

---

## 12. Risks & Open Assumptions

This section lists everything the PRD assumes to be true that the team has not yet operationally verified. Each item has a named owner or "TBD" and a target resolution date.

| # | Risk / open assumption | Why it matters | Owner | Resolution deadline |
|---|---|---|---|---|
| 1 | Aggregator relationship unconfirmed (named-type only; no LOI yet) | Pilot cannot source produce without it | Business co-founder | Phase 0, week 2 |
| 2 | Pilot unit-cost model not yet built | v1 unit economics depend on it | Technical co-founder + Business co-founder | Phase 0, week 2 |
| 3 | Dhaka-specific cost numbers (rent, courier, gateway, household spend, cold-chain, aggregator margins) unverified in this document | Every cost line in the unit-cost model is "team to verify" | Business co-founder | Phase 0, week 3 |
| 4 | 1-week pre-pilot dry run not yet run | Spoilage is the #1 cost-stack risk and the only way to measure it | Business co-founder | Phase 0, week 4 |
| 5 | Specific QC hub site in Uttara or Mohammadpur not yet scouted | Hub lease terms gate pilot operations | Business co-founder | Phase 0, week 3 |
| 6 | Funding source committed or in discussion but not yet closed | Runway gates the v1 build | Both co-founders | Before Phase 1 starts |
| 7 | Founding team named at role level; specific individuals not disclosed in this document | Plan needs confirmed people, not roles | Both co-founders | Internal confirmation before pilot |
| 8 | Live payment gateway account not yet opened (Stripe preferred; SSLCOMMERZ/bKash/Nagad as BD alternatives) | The v1 build ships against a local mock gateway, so this blocks **real money collection**, not the build. Still required before the pilot charges actual customers | Business co-founder | Phase 0, week 3 |
| 9 | Last-mile courier tariff quotes (Pathao / Steadfast) not yet obtained | #7 in the cost stack is the second-biggest cost | Business co-founder | Phase 0, week 2 |
| 10 | Jashore / Bogura cooperative contact not yet named (relationship-type only) | Aggregator identity is the supply-side critical path | Business co-founder | Phase 0, week 1 |
| 11 | Pilot customer network (30–50 families) not yet explicitly confirmed | Pilot has no customers without this | Business co-founder | Phase 0, week 4 |
| 12 | No B2B data service in v1 (per scope), but no documented analysis of the deferred B2B opportunity | B2B is the long-term revenue diversification; the deferred decision should be made on data, not on absence of analysis | Both co-founders | Gate E (month 12) |
| 13 | No competitor analysis in this document | The product claims to address a specific incumbent set (Swapno, Unimart, Daily Shopping, wet markets) but is not benchmarked against their current produce quality, pricing, or delivery options | Business co-founder | Phase 0, week 2 |
| 14 | Web access unavailable during this document's drafting; no Dhaka-specific public data cited | Limits the external validation possible; cost inputs are team-sourced only | Both co-founders | Closed when cost model is built in Phase 0 |

---

## 13. Appendix — Definitions and terminology

- **QC hub:** the physical facility in Dhaka where aggregator shipments are received, inspected, harvest-date-verified, and graded before being listed to the consumer app. v1 has exactly one.
- **Aggregator:** an upstream supplier (cooperative, aratdar, faria/bepari network) that consolidates produce from multiple farms and sells to FreshTrace.
- **Aratdar:** Bangladeshi term for a wholesale-commission agent who intermediates between producers and retailers, typically based in a major wholesale market (e.g., Karwan Bazar in Dhaka).
- **Faria / Bepari:** Bangladeshi terms for itinerant produce traders who buy at farm-gate and sell to aratdars or retailers.
- **Pilot:** the 90-day concierge MVP described in Section 7. Runs in Phase 1.
- **v1:** the lean marketplace build described in Section 8. Built in Phase 2.
- **Gate A / B / C / D / E:** the pre-committed go/no-go checkpoints at the end of each phase (Section 9).
- **BDT:** Bangladeshi Taka. Indicative ranges in this document are based on team assumptions where marked "team to verify."
- **Stack:** Next.js 16 (App Router) in JavaScript + Tailwind CSS v4 + HeroUI + Prisma ORM over SQLite, deployed as a single application on Vercel.
- **Mock Stripe checkout:** the local, offline stand-in for Stripe Checkout used in v1. Mirrors the Stripe Checkout request/response shape so that replacing it with live Stripe is a provider swap, not a rewrite.
- **Stripe:** the preferred live payment provider for the pilot. Not yet provisioned; v1 uses the mock.
- **SSLCOMMERZ:** Bangladesh-based payment gateway aggregator that integrates bKash, Nagad, and card payments. Retained as a BD-specific alternative to Stripe.
- **bKash / Nagad:** Bangladesh's two dominant mobile financial services platforms.
- **CAC:** Customer Acquisition Cost — total marketing / sales spend divided by number of new paying customers in a given period.
- **NPS:** Net Promoter Score — a measure of customer satisfaction and likelihood to recommend, on a -100 to +100 scale.
- **Premium-traceable:** the v1 product positioning. Implies verified origin, verified harvest date, physical QC at a hub, and a visible freshness tier. Does **not** imply formal organic certification in v1.

---

*End of PRD v0.2.*

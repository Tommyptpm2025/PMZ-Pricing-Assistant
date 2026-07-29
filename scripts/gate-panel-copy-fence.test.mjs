/**
 * FENCE for the gate panel. TWO guarantees:
 *   (1) BEHAVIORAL — the split (lib/gate-panel-split.ts) puts BLANKS in the blocking section and
 *       TYPED ZEROS in the zeros section, with zero overlap. A zero is a decision, not a defect, and
 *       must never be scolded under the red blocker headline.
 *   (2) COPY CHOKEPOINT — every user-visible panel string lives ONLY in components/GatePanel.tsx.
 *       The panel drifted into two verbatim copies once; this stops it recurring, and now covers the
 *       Section 2 (zeros) copy too.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/gate-panel-copy-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { partitionGatePanel } from "../lib/gate-panel-split.ts";
import { buildLineGateFailures, classifyGateFailures } from "../lib/lem-detail.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};

// ── 1 — BEHAVIORAL: one blank + four typed zeros → blank blocks, zeros carry, no overlap ───────
{
  // One line ("Driveway") with ONE blank (Cat Roller hours missing) and FOUR typed zeros.
  const failures = [
    {
      lineId: "l1",
      description: "Driveway",
      noEntries: false,
      issues: [
        { category: "Equipment", name: "Cat Roller", issue: "hours missing", isZero: false, catKey: "equipment", idx: 0 },
        { category: "Labor", name: "Operator", issue: "hours is 0", isZero: true, catKey: "labor", idx: 0 },
        { category: "Labor", name: "Laborer", issue: "hours is 0", isZero: true, catKey: "labor", idx: 1 },
        { category: "Material", name: "Gravel", issue: "qty is 0", isZero: true, catKey: "material", idx: 0 },
        { category: "Miscellaneous", name: "Permit", issue: "qty is 0", isZero: true, catKey: "misc", idx: 0 },
      ],
    },
  ];
  const { blockers, zeros, zeroCount } = partitionGatePanel(failures);

  const blockerIssues = blockers.flatMap((b) => b.issues);
  const zeroIssues = zeros.flatMap((z) => z.issues);

  // No TYPED ZERO may appear in the blocking section (checked first, so a leak trips THIS message).
  assert.ok(
    blockerIssues.every((i) => !i.isZero),
    "lib/gate-panel-split.ts put a TYPED ZERO in the blocking section. A typed zero is a DECISION, " +
      "not a defect — the owner chose not to use that man or machine on this job. It belongs in the " +
      "zeros section (grey, 'nothing to fix'), NEVER under the red blocker headline. Move it back to " +
      "the zeros filter in lib/gate-panel-split.ts."
  );
  // The blank, and ONLY the blank, is in the blocking section.
  assert.equal(blockerIssues.length, 1, "the one blank is in the blocking section");

  // All four zeros, and only zeros, are in the zeros section.
  assert.equal(zeroCount, 4, "all four typed zeros are counted in the zeros section");
  assert.equal(zeroIssues.length, 4, "all four typed zeros are listed in the zeros section");
  assert.ok(zeroIssues.every((i) => i.isZero), "the zeros section contains only typed zeros");

  // Zero overlap: no single entry appears in both sections.
  const overlap = blockerIssues.filter((bi) => zeroIssues.includes(bi));
  assert.equal(overlap.length, 0, "no entry appears in both the blocking and the zeros section");
}
console.log("PASS: gate-panel split — blanks block, typed zeros carry into the zeros section, zero overlap");

// ── 2 — DERIVATION CROSS-CHECK: the panel's blockers === the gate's blocking set (no second rule) ─
// One rule decides what blocks a send: classifyGateFailures. The panel must DERIVE its red section
// from that set, never re-decide it. Run the SAME fixtures through the gate and the panel and assert
// the panel's blocker lines are EXACTLY the gate's blocking lines — so the two can never disagree.
{
  // Tom's fixtures: blank only, zeros only, blank+zeros, no LEM detail at all, and a clean line.
  const items = [
    { id: "blankOnly", laborEntries: [{ rateId: "op", hours: undefined }] },
    { id: "zerosOnly", laborEntries: [{ rateId: "op", hours: 0 }] },
    { id: "blankAndZeros", laborEntries: [{ rateId: "op", hours: undefined }, { rateId: "op", hours: 0 }] },
    { id: "noLemDetail" }, // no entries at all → noEntries
    { id: "cleanLine", laborEntries: [{ rateId: "op", hours: 8 }] },
  ];
  const failures = items.map((it, i) => buildLineGateFailures(it, CATS, it.id || `Line ${i + 1}`)).filter(Boolean);
  const { blocking } = classifyGateFailures(failures);           // the gate's decision — the one that refuses
  const { blockers } = partitionGatePanel(blocking);             // what the panel would show in red

  const gateBlockingIds = [...new Set(blocking.map((f) => f.lineId))].sort();
  const panelBlockerIds = [...new Set(blockers.map((b) => b.line.lineId))].sort();

  assert.deepEqual(
    panelBlockerIds,
    gateBlockingIds,
    "The panel and the gate DISAGREE about what blocks a send. The gate refuses these lines:\n" +
      `    ${JSON.stringify(gateBlockingIds)}\n` +
      "  but the panel's red blocker section would show:\n" +
      `    ${JSON.stringify(panelBlockerIds)}\n` +
      "  A line the gate blocks MUST appear in the red section — never hidden in grey saying 'nothing\n" +
      "  to fix', which would strand the owner with a refusal and no reason. Keep the panel DERIVING\n" +
      "  from classifyGateFailures' blocking set; do not give lib/gate-panel-split.ts its own blocking rule."
  );
  // The gate blocks the blank, the mixed line, and the no-detail line — but NOT the zeros-only or clean line.
  assert.deepEqual(gateBlockingIds, ["blankAndZeros", "blankOnly", "noLemDetail"], "sanity: the gate blocks exactly the blank/no-entry lines");
}
console.log("PASS: gate-panel derivation — the panel's blocker set is exactly the gate's blocking set (one rule, no drift)");

// ── 3 — COPY CHOKEPOINT: every panel string lives ONLY in components/GatePanel.tsx ─────────────
const PANEL_STRINGS = [
  "Can’t send yet — these lines have nothing priced behind them. Add the labor, equipment, or material, or mark the line a flat rate, before this price goes to the customer:",
  "Can’t accept yet — fix these entries before this quote can become a Work Order:",
  "no LEM detail entered",
  "incomplete entries:",
  "Use “Edit in Pricer” below to fix these entries.",
  "Zeros in this quote —",
  "Nothing to fix.",
  "A zero means you chose not to use that man or machine on this job. It prints on the crew’s sheet that way. Change any of them if that’s not what you meant.",
];

function tsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// (a) The one home actually holds the copy — the words didn't vanish in the move.
const panel = readFileSync(join(repoRoot, "components", "GatePanel.tsx"), "utf8");
for (const s of PANEL_STRINGS) {
  assert.ok(panel.includes(s), `components/GatePanel.tsx is missing a gate-panel string it should own:\n  ${JSON.stringify(s)}`);
}

// (b) Repo-wide: no file under app/ or lib/ re-types any panel string.
for (const abs of [...tsFiles(join(repoRoot, "app")), ...tsFiles(join(repoRoot, "lib"))]) {
  const rel = abs.slice(repoRoot.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
  const text = readFileSync(abs, "utf8");
  for (const s of PANEL_STRINGS) {
    assert.ok(
      !text.includes(s),
      `${rel} types a gate-panel string that must live ONLY in components/GatePanel.tsx:\n` +
        `  ${JSON.stringify(s)}\n` +
        `  The panel is one component both pages render. Do NOT re-type its words — render\n` +
        `  <GatePanel failures={…} variant="send"|"accept" showEditInPricerFooter={…} /> and pass the\n` +
        `  data as props. If this sentence belongs to a DIFFERENT feature, reword it so it is not the\n` +
        `  gate panel's copy.`
    );
  }
}
console.log("PASS: gate-panel copy — every panel string (Section 1 blocker + Section 2 zeros) lives only in components/GatePanel.tsx");

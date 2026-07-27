/**
 * FENCE for the gate-panel COPY. The red send/accept gate panel is now ONE component
 * (components/GatePanel.tsx). Its user-visible words must live THERE and nowhere else — one fact,
 * one home, the same chokepoint the send RULE got, now for the WORDS. The panel drifted into two
 * verbatim copies once; this stops it recurring: repo-wide, scan every .ts/.tsx under app/ and lib/
 * and assert none of them re-types a panel string.
 * Run: node scripts/gate-panel-copy-fence.test.mjs   (pure Node — no .ts imports)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// The gate panel's user-visible strings — the exact words a refusal shows. These live in
// components/GatePanel.tsx and are typed nowhere else in the app.
const PANEL_STRINGS = [
  "Can’t send yet — these entries have no hours or quantity behind them. Fix them before this price goes to the customer:",
  "Can’t accept yet — fix these entries before this quote can become a Work Order:",
  "no LEM detail entered",
  "incomplete entries:",
  "Use “Edit in Pricer” below to fix these entries.",
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
console.log("PASS: gate-panel copy — every panel string lives only in components/GatePanel.tsx; no file under app/ or lib/ re-types it");

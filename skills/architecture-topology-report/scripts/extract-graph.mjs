#!/usr/bin/env node
// Extract the package dependency topology of a pnpm/npm workspace and emit
// the structural facts an architecture-topology report is built from.
//
// Structural analysis plus declared tier policy facts — it reports edges,
// cycles, fan-in/out, exports, named-package consumers, manifest-declared
// package tiers, and machine-computed tier-policy violations.
//
// Usage:
//   node extract-graph.mjs [--root ts/packages] [--kit @sdl/capability-kit]
//                          [--api-needle api] [--src-dir src] [--pretty]
//
// Each package carries an approximate `loc` (meaningful TypeScript lines under
// <pkg>/<src-dir>, tests/blank/`//` excluded) so the report can size graph nodes
// by source heft (node area ∝ loc).
//
// Defaults are tuned for sdl-tools but every knob is a flag, so this runs
// against any workspace. Membership in the graph = "is a workspace package"
// (a package.json found under --root); scope strings are never assumed.
//
// Output: JSON on stdout. Edges are RUNTIME only (dependencies + peerDependencies);
// devDependencies are excluded because they are not part of the shipped
// Extension Dependency Graph.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const ROOT = arg("root", "ts/packages");
const KIT = arg("kit", "@sdl/capability-kit");
const API_NEEDLE = arg("api-needle", "api");
const SRC_DIR = arg("src-dir", "src");
const PRETTY = arg("pretty", false);
const OUT = arg("out", false);

// Canonical taxonomy — kept in sync with the workspace source of truth:
// ts/packages/infra/core/test/support/typescript-style-guard/config.ts
// (`packageTierValues`, `packageTierAllowedTargets`, `allowedPackageTierDebtEdges`).
const TIERS = [
  "capability",
  "capability-kit",
  "capability-gateway-backend",
  "sdk",
  "neutral-infra",
  "host",
  "capability-pi",
  "standalone-tool",
  "local-pi-tool",
];
const TIER_SET = new Set(TIERS);
const TIER_POLICY = {
  capability: new Set(["capability", "capability-kit", "capability-gateway-backend", "sdk", "neutral-infra"]),
  "capability-kit": new Set(["capability-gateway-backend", "sdk", "neutral-infra"]),
  "capability-gateway-backend": new Set(["capability-gateway-backend", "neutral-infra"]),
  sdk: new Set(["sdk", "neutral-infra"]),
  "neutral-infra": new Set(["neutral-infra"]),
  host: new Set(["capability", "sdk", "capability-kit", "capability-gateway-backend", "neutral-infra"]),
  "capability-pi": new Set([
    "capability-pi",
    "host",
    "capability",
    "capability-kit",
    "capability-gateway-backend",
    "sdk",
    "neutral-infra",
  ]),
  "standalone-tool": new Set([
    "standalone-tool",
    "host",
    "capability",
    "capability-kit",
    "capability-gateway-backend",
    "sdk",
    "neutral-infra",
  ]),
  "local-pi-tool": new Set(["local-pi-tool", "host", "capability-gateway-backend", "neutral-infra"]),
};
// Tier-policy violations that are explicitly tracked as accepted debt (NUL-joined
// "from\0to" keys) — kept in sync with `allowedPackageTierDebtEdges` in the source
// of truth. A violating edge on this list is reported `severity: "debt"`, not "hard".
const ALLOWED_DEBT_EDGES = new Map([
  ["@sdl/ccc\0@sdl/pi", "CCC clean-consumer debt tracked by the sdl-extension-architecture objective step 5."],
  ["@sdl/kernel\0@sdl/slot", "SDK-to-capability CLI mount debt: @sdl/kernel still mounts Slot directly."],
  [
    "@sdl/brmem\0@sdl/capability-kit",
    "Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
  ],
  [
    "@sdl/brmem\0@sdl/git",
    "Git gateway backend relocation debt: brmem consumes @sdl/git until the separate brmem follow-up retier lands.",
  ],
]);

// Approximate source size per package: meaningful lines of TypeScript under
// <pkg>/<SRC_DIR>, excluding tests and blank/`//`-only lines. Used by the report
// to size graph nodes by LOC (node area ∝ loc), so the visual weight of a package
// matches its actual heft. Cheap and good-enough — not a SLOC tool.
function countLoc(dir) {
  let loc = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      loc += countLoc(p);
    } else if (
      e.isFile() &&
      /\.(ts|tsx)$/.test(e.name) &&
      !/\.(test|spec)\.tsx?$/.test(e.name) &&
      !e.name.endsWith(".d.ts")
    ) {
      let text;
      try {
        text = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("//")) loc++;
      }
    }
  }
  return loc;
}

// Discover every package.json under ROOT, excluding node_modules.
let files;
try {
  files = execSync(
    `find ${JSON.stringify(ROOT)} -name package.json -not -path "*/node_modules/*"`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
} catch (e) {
  console.error(`Failed to scan ${ROOT}: ${e.message}`);
  process.exit(1);
}

const pkgs = {}; // name -> { path, exports, tier, deps:{name:[kinds]} }
const manifestErrors = [];
for (const f of files) {
  let d;
  try {
    d = JSON.parse(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  if (!d.name) continue;
  const tier = d.sdl?.tier;
  if (typeof tier !== "string") {
    manifestErrors.push(`${d.name} (${f}) is missing sdl.tier; known tiers: ${TIERS.join(", ")}`);
  } else if (!TIER_SET.has(tier)) {
    manifestErrors.push(`${d.name} (${f}) has unknown sdl.tier ${JSON.stringify(tier)}; known tiers: ${TIERS.join(", ")}`);
  }
  const deps = {};
  for (const k of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const dep of Object.keys(d[k] || {})) {
      (deps[dep] = deps[dep] || new Set()).add(
        k === "devDependencies" ? "dev" : k === "peerDependencies" ? "peer" : "prod",
      );
    }
  }
  const path = f.replace(/\/package\.json$/, "");
  pkgs[d.name] = {
    path,
    exports: Object.keys(d.exports || {}),
    tier,
    deps,
    loc: countLoc(join(path, SRC_DIR)),
  };
}

if (manifestErrors.length) {
  console.error(`Package tier declaration errors:\n${manifestErrors.map((error) => `  - ${error}`).join("\n")}`);
  process.exit(1);
}

const names = new Set(Object.keys(pkgs));

// Runtime edges (prod + peer) limited to in-workspace targets.
const graph = {}; // name -> [targets]
for (const [name, p] of Object.entries(pkgs)) {
  const out = [];
  for (const [dep, kinds] of Object.entries(p.deps)) {
    if (!names.has(dep)) continue; // external dep, not part of the workspace graph
    if (kinds.has("prod") || kinds.has("peer")) out.push(dep);
  }
  graph[name] = [...new Set(out)].sort();
}

// Tarjan strongly-connected components -> cycles are SCCs of size > 1.
function findCycles(g) {
  let idx = 0;
  const stack = [], onstack = {}, index = {}, low = {}, sccs = [];
  function strongconnect(v) {
    index[v] = low[v] = idx++;
    stack.push(v);
    onstack[v] = true;
    for (const w of g[v] || []) {
      if (!(w in index)) {
        strongconnect(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onstack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onstack[w] = false;
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  }
  for (const v of Object.keys(g)) if (!(v in index)) strongconnect(v);
  return sccs;
}

const cycles = findCycles(graph);

// Fan-in / fan-out over the runtime graph.
const fanOut = {}, fanIn = {};
for (const n of names) {
  fanOut[n] = 0;
  fanIn[n] = 0;
}
for (const [n, outs] of Object.entries(graph)) {
  fanOut[n] = outs.length;
  for (const t of outs) fanIn[t] = (fanIn[t] || 0) + 1;
}

function tierViolationForEdge(from, to) {
  const fromTier = pkgs[from]?.tier;
  const toTier = pkgs[to]?.tier;
  if (fromTier === undefined || toTier === undefined) return undefined;
  if (TIER_POLICY[fromTier]?.has(toTier)) return undefined;
  // The edge breaks tier policy. Accepted-debt edges are tracked, not hard failures.
  const debt = ALLOWED_DEBT_EDGES.get(`${from}\0${to}`);
  if (debt !== undefined) {
    return { from, to, fromTier, toTier, severity: "debt", policy: `${fromTier}-must-not-depend-on-${toTier}`, debtNote: debt };
  }
  return {
    from,
    to,
    fromTier,
    toTier,
    severity: "hard",
    policy: `${fromTier}-must-not-depend-on-${toTier}`,
  };
}

const tierViolations = [];
for (const [from, deps] of Object.entries(graph)) {
  for (const to of deps) {
    const violation = tierViolationForEdge(from, to);
    if (violation !== undefined) tierViolations.push(violation);
  }
}

// Per-package facts the report leans on.
const exposesApi = {}; // name -> [api-ish export subpaths]
const apiOnly = []; // packages whose ONLY exports look like /api (no command/main face)
const kitConsumers = [];
const orphans = []; // zero runtime fan-in (nothing in-workspace depends on it)

for (const [name, p] of Object.entries(pkgs)) {
  const apiExports = p.exports.filter((e) => e.toLowerCase().includes(API_NEEDLE.toLowerCase()));
  if (apiExports.length) exposesApi[name] = apiExports;
  const nonApi = p.exports.filter((e) => !e.toLowerCase().includes(API_NEEDLE.toLowerCase()));
  if (apiExports.length && nonApi.length === 0) apiOnly.push(name);
  if (graph[name]?.includes(KIT)) kitConsumers.push(name);
  if (fanIn[name] === 0) orphans.push(name);
}

const ranked = (m) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

const out = {
  meta: {
    root: ROOT,
    kit: KIT,
    apiNeedle: API_NEEDLE,
    packageCount: names.size,
    edgeKinds: "runtime (dependencies + peerDependencies)",
    tiers: TIERS,
    tierPolicy: Object.fromEntries(Object.entries(TIER_POLICY).map(([tier, allowed]) => [tier, [...allowed].sort()])),
  },
  packages: Object.fromEntries(
    Object.entries(pkgs)
      .sort()
      .map(([n, p]) => [n, { path: p.path, tier: p.tier, exports: p.exports, runtimeDeps: graph[n], loc: p.loc }]),
  ),
  graph,
  tierViolations,
  cycles, // [] means acyclic
  fanOut: ranked(fanOut),
  fanIn: ranked(fanIn),
  exposesApi, // capability-API convention adoption
  apiOnly, // anomaly: API published with no command/main face
  kitConsumers, // gateway-injected-via-kit adoption
  orphans, // zero fan-in: unwired leaves
};

if (OUT === true) {
  console.error("`--out` requires a path");
  process.exit(1);
}

const json = JSON.stringify(out, null, PRETTY ? 2 : 0) + "\n";
// Tee: always print to stdout (default), and additionally persist to --out so
// build-report.mjs can reuse it via --graph without re-extracting.
process.stdout.write(json);
if (typeof OUT === "string") writeFileSync(OUT, json);

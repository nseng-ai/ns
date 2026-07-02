// Deterministic raw-inventory spec synthesizer.
//
// Turns the structural graph that extract-graph.mjs emits into a COMPLETE,
// valid report spec — verdict, tier stack, scorecard, finding cards, keystone —
// with zero agent reasoning. This is what makes the topology report a "standing
// application": `build-report.mjs --open` (no `--spec`) renders a full report
// instantly because this module supplies the editorial slots from facts alone.
//
// This is RAW INVENTORY mode: it reads manifests, never grades against an unstated
// target. Language stays factual ("present", "N packages", "top fan-out") and avoids
// normative verdicts ("drift", "violates the architecture") except where the fact is
// directly encoded by package metadata (declared-tier `tierViolations`). An agent
// authoring a `--spec` for target-scorecard mode is still the path when a target is
// named; this is the no-target fast path.

import { FALLBACK_TIER, label, TIER_RANK, TIERS } from "./tiers.mjs";

const mono = (s) => `<span class="font-mono text-xs">${s}</span>`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function tierOf(analysis, id) {
  const t = analysis.packages[id]?.tier;
  return Object.hasOwn(TIERS, t) ? t : FALLBACK_TIER;
}

// Stable, mermaid-safe node id for a package, plus a label-bearing first mention.
function mermaidNodes() {
  const seen = new Set();
  const idOf = (pkg) => `n_${pkg.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const ref = (pkg) => {
    const id = idOf(pkg);
    if (seen.has(id)) return id;
    seen.add(id);
    return `${id}["${label(pkg)}"]`;
  };
  return { ref };
}

// ── tier stack (the "target model" section, repurposed as a declared-tier stack) ─
function tierBands(analysis) {
  const byTier = new Map();
  for (const id of Object.keys(analysis.packages)) {
    const t = tierOf(analysis, id);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(id);
  }
  const rank = (t) => {
    const i = TIER_RANK.indexOf(t);
    return i === -1 ? 99 : i;
  };
  return [...byTier.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((t) => {
      const v = TIERS[t];
      const ids = byTier.get(t).sort();
      return {
        label: v.name,
        bg: v.fill,
        labelBg: v.stroke,
        chipBorder: v.stroke,
        noteColor: v.stroke,
        packages: ids.map((id) => ({ name: label(id) })),
        note: plural(ids.length, "package"),
      };
    });
}

// ── findings: notable topology facts, each mapped to an existing card register ──
function cycleFinding(analysis, scc) {
  const { ref } = mermaidNodes();
  const set = new Set(scc);
  const lines = ["flowchart LR"];
  for (const src of scc) {
    for (const t of analysis.graph[src] || []) {
      if (set.has(t)) lines.push(`  ${ref(src)} --> ${ref(t)}`);
    }
  }
  lines.push(`  classDef cy fill:#fee2e2,stroke:#dc2626,color:#991b1b;`);
  lines.push(`  class ${scc.map((p) => `n_${p.replace(/[^a-zA-Z0-9]/g, "_")}`).join(",")} cy;`);
  return {
    title: `Dependency cycle across ${plural(scc.length, "package")}`,
    strength: "Strong",
    tag: "cycle",
    fanin: lines.join("\n"),
    problem:
      `These packages form a strongly-connected component — each can reach every other through runtime edges: `
      + scc.map((p) => mono(p)).join(", ") + `. A cycle means there is no acyclic build/initialization order within the group.`,
    solution:
      `Inspect first. Pick the single back-edge whose removal breaks the loop (often the one pointing "up" in the layered view) and trace what that import actually needs — it can usually move down into shared infra or behind a seam.`,
    wins: ["restores an acyclic order", "isolates the load-bearing back-edge", "clarifies the intended layering"],
  };
}

function hardViolationFinding(hard) {
  const { ref } = mermaidNodes();
  const lines = ["flowchart LR"];
  for (const v of hard) lines.push(`  ${ref(v.from)} -->|${v.policy}| ${ref(v.to)}`);
  lines.push(`  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;`);
  const cls = [...new Set(hard.flatMap((v) => [v.from, v.to]))]
    .map((p) => `n_${p.replace(/[^a-zA-Z0-9]/g, "_")}`)
    .join(",");
  lines.push(`  class ${cls} bad;`);
  return {
    title: `${plural(hard.length, "hard declared-tier violation")}`,
    strength: "Strong",
    tag: "declared-tier · hard",
    fanin: lines.join("\n"),
    problem:
      `The package manifests declare an <span class="font-mono text-sm">sdl.tier</span> for each package and a policy for which tiers may depend on which. `
      + `These runtime edges break that declared policy: `
      + hard.map((v) => `${mono(v.from)} → ${mono(v.to)} (${v.fromTier} → ${v.toTier})`).join(", ") + `.`,
    solution:
      `This is the one place the inventory carries a metadata-encoded verdict. For each edge, decide whether the declared tier is wrong (fix the manifest) or the dependency is wrong (re-home the import behind a seam or down a tier).`,
    wins: ["aligns code with declared tiers", "lets the tier guard hard-fail cleanly"],
  };
}

function debtFinding(debt) {
  const { ref } = mermaidNodes();
  const lines = ["flowchart LR"];
  for (const v of debt) lines.push(`  ${ref(v.from)} -.->|${v.policy}| ${ref(v.to)}`);
  lines.push(`  classDef debt fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-dasharray:4 3;`);
  const cls = [...new Set(debt.flatMap((v) => [v.from, v.to]))]
    .map((p) => `n_${p.replace(/[^a-zA-Z0-9]/g, "_")}`)
    .join(",");
  lines.push(`  class ${cls} debt;`);
  return {
    title: `${plural(debt.length, "allowlisted tier-debt edge")}`,
    strength: "Worth watching",
    tag: "declared-tier · debt",
    fanin: lines.join("\n"),
    problem:
      `These edges break the declared tier policy but are explicitly tolerated (allowlisted debt, not hard failures): `
      + debt.map((v) => `${mono(v.from)} → ${mono(v.to)} (${v.fromTier} → ${v.toTier})`).join(", ") + `.`,
    solution:
      `Each is a tracked migration tail — the edge a future retier is meant to remove. They mark exactly which packages that work would touch.`,
    wins: ["surfaces the tracked migration tail", "names every package a retier would touch"],
  };
}

function apiOnlyFinding(apiOnly, exposesApi) {
  return {
    title: `API-only ${apiOnly.length === 1 ? "package" : "packages"} with no command/main face`,
    strength: "Speculative",
    tag: "anomaly",
    chipRows: [{
      label: "exposes only an /api export:",
      items: apiOnly.map((p) => ({ text: label(p), state: "pending" })),
    }],
    problem:
      `These packages ship an <span class="font-mono text-sm">/api</span>-style export but no command or main entry: `
      + apiOnly.map((p) => mono(p)).join(", ") + `. Of ${plural(Object.keys(exposesApi).length, "package")} that expose an API, these are the ones with no other face.`,
    solution:
      `Confirm intent: either a deliberate provider-only seam (document it) or a capability still missing its command face (add one).`,
    wins: ["resolves an export-shape anomaly"],
  };
}

function shapeFinding(analysis) {
  const top = analysis.fanOut[0];
  const spine = analysis.fanIn[0];
  const heaviest = Object.entries(analysis.packages)
    .map(([id, p]) => ({ id, loc: p.loc ?? 0 }))
    .sort((a, b) => b.loc - a.loc)[0];
  return {
    title: "Graph shape: who consumes, who carries weight",
    strength: "Worth watching",
    tag: "topology reading",
    problem:
      `The highest fan-out package is ${mono(top.name)} (${top.count} runtime deps) — usually the intended top-level consumer. `
      + `The fan-in spine is ${mono(spine.name)} (${spine.count} dependents) — load-bearing infra. `
      + `The heaviest node is ${mono(heaviest.id)} (~${heaviest.loc.toLocaleString()} LOC).`,
    solution:
      `Read these three together: a top-consumer with high fan-out, a spine with high fan-in, and the largest node by source. Where they coincide is where change costs the most.`,
    wins: ["orients a first read of the graph", "locates the load-bearing nodes"],
  };
}

function synthFindings(analysis, hard, debt) {
  const findings = [];
  for (const scc of analysis.cycles || []) findings.push(cycleFinding(analysis, scc));
  if (hard.length) findings.push(hardViolationFinding(hard));
  if (debt.length) findings.push(debtFinding(debt));
  if ((analysis.apiOnly || []).length) findings.push(apiOnlyFinding(analysis.apiOnly, analysis.exposesApi || {}));
  findings.push(shapeFinding(analysis));
  return findings;
}

// ── keystone: the single highest-leverage first deeper-read, chosen by facts ────
function synthKeystone(analysis, hard) {
  const cycles = analysis.cycles || [];
  const locOf = (id) => analysis.packages[id]?.loc ?? 0;
  const sequence = [
    cycles.length ? `1 · break the largest cycle` : null,
    hard.length ? `${cycles.length ? 2 : 1} · resolve hard tier edges` : null,
    `inspect top fan-out: ${label(analysis.fanOut[0].name)}`,
    `inspect fan-in spine: ${label(analysis.fanIn[0].name)}`,
  ].filter(Boolean);

  if (cycles.length) {
    const biggest = [...cycles].sort((a, b) => b.length - a.length)[0];
    return {
      title: `Break the largest cycle — the ${plural(biggest.length, "package")} SCC`,
      paras: [
        `The graph is <strong>not acyclic</strong>: ${plural(cycles.length, "strongly-connected component")} remain. The largest spans `
        + biggest.map((p) => `<span class="font-mono text-sm text-emerald-200">${label(p)}</span>`).join(", ")
        + `. A cycle is the topology fact that most constrains build order and reasoning, so it is the first thing worth a human read.`,
        `Find the back-edge whose removal breaks the loop and trace the single import driving it — that edge, not the whole group, is the lever.`,
      ],
      sequence,
    };
  }
  if (hard.length) {
    const worst = [...hard].sort((a, b) => locOf(b.from) - locOf(a.from))[0];
    return {
      title: `Resolve the hard tier edge ${label(worst.from)} → ${label(worst.to)}`,
      paras: [
        `The graph is acyclic, so the sharpest metadata-encoded fact is ${plural(hard.length, "hard declared-tier violation")}. `
        + `The heaviest source is <span class="font-mono text-sm text-rose-200">${worst.from}</span> → <span class="font-mono text-sm text-rose-200">${worst.to}</span> `
        + `(${worst.policy}). Start there: decide whether the declared tier or the dependency is what's wrong.`,
      ],
      sequence,
    };
  }
  const top = analysis.fanOut[0];
  return {
    title: `Read the densest consumer first — ${label(top.name)}`,
    paras: [
      `The graph is acyclic with no hard declared-tier violations. The most informative first read is the densest node: `
      + `<span class="font-mono text-sm text-emerald-200">${top.name}</span> carries the highest fan-out (${top.count}), so it touches the most of the system. `
      + `Walk its edges to understand how the workspace is wired before anything else.`,
    ],
    sequence,
  };
}

// ── the synthesized spec ────────────────────────────────────────────────────────
export function synthesizeSpec(analysis, { repo = "workspace" } = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const cycles = analysis.cycles || [];
  const violations = analysis.tierViolations || [];
  const hard = violations.filter((v) => v.severity === "hard");
  const debt = violations.filter((v) => v.severity === "debt");
  const orphans = analysis.orphans || [];
  const apiOnly = analysis.apiOnly || [];
  const top = analysis.fanOut[0];
  const spine = analysis.fanIn[0];

  return {
    repo,
    targetName: "raw topology inventory",
    date,
    intro:
      `<strong>No target architecture was supplied</strong>, so this is a raw inventory of the actual workspace topology: package distribution units from `
      + `<span class="font-mono text-sm">package.json</span> files plus source topology circles discovered from <span class="font-mono text-sm">src/&lt;component&gt;/</span> directories. `
      + `Readings are factual (package cycles, declared-tier violations, fan shape, seams, orphans); nothing here is graded as "drift" or "on track" `
      + `except the declared-tier violations, which the package manifests encode directly. The graph visualization defaults to the package graph over runtime edges; `
      + `a toggle switches to the topology circles (static TypeScript import edges) for source-component granularity.`,

    verdict: {
      headline: cycles.length || hard.length
        ? "Structural facts to inspect: the graph carries cycles and/or declared-tier violations."
        : "The graph is acyclic with no hard declared-tier violations.",
      drift: cycles.length > 0 || hard.length > 0,
      stats: [
        {
          value: String(cycles.length),
          label: "cycles in the graph",
          sub: cycles.length ? "strongly-connected components" : "fully acyclic",
          health: cycles.length ? "red" : "green",
        },
        {
          value: String(hard.length),
          label: "hard tier violations",
          sub: "declared sdl.tier policy",
          health: hard.length ? "red" : "green",
        },
        {
          value: String(debt.length),
          label: "tier debt edges",
          sub: "allowlisted, tracked",
          health: debt.length ? "amber" : "green",
        },
        {
          value: String(orphans.length),
          label: "orphan packages",
          sub: "zero runtime fan-in",
          health: orphans.length ? "amber" : "green",
        },
      ],
      read:
        `${analysis.meta.packageCount} packages over runtime edges (${mono("dependencies")} + ${mono("peerDependencies")}). `
        + `The graph is <strong>${cycles.length ? `not acyclic (${plural(cycles.length, "cycle")})` : "acyclic"}</strong>. `
        + `Declared-tier policy shows <strong>${plural(hard.length, "hard violation")}</strong> and ${plural(debt.length, "debt edge")}. `
        + `The top fan-out package is ${mono(top.name)} (${top.count}); the fan-in spine is ${mono(spine.name)} (${spine.count}). `
        + `${plural(Object.keys(analysis.exposesApi || {}).length, "package")} expose an `
        + `<span class="font-mono text-sm">/api</span> seam${apiOnly.length ? `, ${plural(apiOnly.length, "of them")} api-only` : ""}. `
        + `The circle overlay currently discovers ${plural(analysis.meta.topologyCircleCount ?? analysis.meta.packageCount, "topology circle")}; inspect the graph for source-component granularity such as <span class="font-mono text-sm">@sdl/core/time</span>.`, 
    },

    northStar: {
      rule:
        `No target model was supplied. Shown instead is the <strong>declared-tier stack</strong> as it stands — each package placed in the `
        + `band of its manifest <span class="font-mono text-sm">sdl.tier</span>, ordered from consumers at the top down to neutral infra at the bottom. `
        + `The graph below renders these packages by default; toggle to the subpackage-circle view to split packages into the topology circles their `
        + `source directories expose — circles inherit their enclosing package tier.`,
      bands: tierBands(analysis),
    },

    graphIntro:
      `Every runtime package edge, live. Node <strong>area ∝ LOC</strong>; node color = declared tier; lanes/filters = declared tier. `
      + `Toggle the view to <em>subpackage circles</em> for source-component granularity (static TypeScript import edges, node color = enclosing package). `
      + (cycles.length
        ? `<span class="text-red-600 font-medium">Red edges</span> mark cycle back-edges. `
        : `The package graph is <strong>acyclic</strong> — no red cycle edges to draw. `)
      + `Drag to pin, scroll to zoom, hover to trace a node's neighbours, toggle to the tier-clustered layout, toggle tiers to drop the off-axis tools.`,
    graphCaption:
      `Heaviest node: ${mono(heaviestId(analysis))}. Fan-in spine: ${mono(spine.name)} (${spine.count} dependents) — `
      + `load-bearing infra. Highest fan-out: ${mono(top.name)} (${top.count}).`,

    scorecard: synthScorecard(analysis, { cycles, hard, debt, orphans, apiOnly, top, spine }),
    findings: synthFindings(analysis, hard, debt),
    keystone: synthKeystone(analysis, hard),

    provenance:
      `Structural facts extracted deterministically from <span class="font-mono">package.json</span> runtime edges and TypeScript import/export circle edges `
      + `(${analysis.meta.packageCount} packages, ${analysis.meta.topologyCircleCount ?? analysis.meta.packageCount} topology circles, ${cycles.length ? `${cycles.length} package cycle(s)` : "package cycles = []"}). `
      + `No target architecture supplied — raw inventory mode. Spec synthesized by <span class="font-mono">synthesize-spec.mjs</span>.`, 
  };
}

function heaviestId(analysis) {
  return Object.entries(analysis.packages)
    .map(([id, p]) => [id, p.loc ?? 0])
    .sort((a, b) => b[1] - a[1])[0][0];
}

function synthScorecard(analysis, f) {
  const { cycles, hard, debt, orphans, apiOnly, top, spine } = f;
  const exposesApi = analysis.exposesApi || {};
  const kitConsumers = analysis.kitConsumers || [];
  const rows = [
    {
      invariant: `Dependency graph is acyclic`,
      status: cycles.length ? plural(cycles.length, "cycle") : "acyclic",
      statusKind: cycles.length ? "open" : "holds",
      evidence: cycles.length
        ? cycles.map((scc) => scc.map((p) => mono(p)).join(" ↔ ")).join("; ")
        : `${mono("cycles = []")} — no strongly-connected components of size &gt; 1.`,
    },
    {
      invariant: `Declared-tier policy: no hard violations`,
      status: hard.length ? plural(hard.length, "hard") : "none",
      statusKind: hard.length ? "open" : "holds",
      evidence: hard.length
        ? hard.map((v) => `${mono(`${v.from} → ${v.to}`)} (${v.policy})`).join("; ")
        : `every runtime edge respects the declared ${mono("sdl.tier")} policy.`,
    },
    {
      invariant: `Tier debt: allowlisted policy-violating edges`,
      status: debt.length ? plural(debt.length, "edge") : "none",
      statusKind: debt.length ? "partial" : "holds",
      evidence: debt.length
        ? debt.map((v) => mono(`${v.from} → ${v.to}`)).join(", ")
        : `no tracked tier-debt edges.`,
    },
    {
      invariant: `Top fan-out consumer`,
      status: "top fan-out",
      statusKind: "holds",
      evidence: `${mono(top.name)} with ${top.count} runtime dependencies — the densest consumer in the graph.`,
    },
    {
      invariant: `Fan-in spine`,
      status: "load-bearing",
      statusKind: "holds",
      evidence: `${mono(spine.name)} with ${spine.count} dependents — the most depended-on package.`,
    },
    {
      invariant: `Capability API seam adoption`,
      status: plural(Object.keys(exposesApi).length, "package"),
      statusKind: apiOnly.length ? "partial" : "holds",
      evidence: Object.keys(exposesApi).length
        ? `${Object.keys(exposesApi).map(mono).join(", ")} expose an /api seam`
          + (apiOnly.length ? `; ${apiOnly.map(mono).join(", ")} are api-only (no command/main face).` : `.`)
        : `no package exposes an /api-style seam.`,
    },
    {
      invariant: `Capability Kit consumers`,
      status: plural(kitConsumers.length, "package"),
      statusKind: "holds",
      evidence: kitConsumers.length ? kitConsumers.map(mono).join(", ") : `no package depends on the kit.`,
    },
    {
      invariant: `Orphans (zero runtime fan-in)`,
      status: orphans.length ? plural(orphans.length, "orphan") : "none",
      statusKind: orphans.length ? "partial" : "holds",
      evidence: orphans.length
        ? orphans.map(mono).join(", ")
        : `every package has at least one in-workspace dependent.`,
    },
  ];
  return rows;
}

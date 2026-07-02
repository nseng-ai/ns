---
name: architecture-topology-report
disable-model-invocation: true
description: >-
  Build a self-contained HTML report for a workspace's package dependency topology: either
  score it against a named target architecture, or (when no target is supplied) produce a raw
  topology inventory. Use when someone wants a topology report, a dependency-graph or
  package-graph audit, a layering/cycle check, or to see how close a monorepo is to a stated
  architectural end-state (e.g. an objective's target, an ADR's layering rules). For the
  no-target case the `scripts/topology` launcher renders the whole report instantly with no
  agent in the loop; reach for the agent only to score against a named target.
metadata:
  internal: true
---

# Architecture Topology Report

Produce an **architecture topology report**: the actual runtime package dependency graph of a
workspace, rendered as an editorial HTML report. It has two modes:

1. **Raw inventory mode** (no target named — the default, and now a *standing application*):
   render and summarize the graph as-is — cycles, declared-tier violations, fan-in/out, `/api`
   seams, kit consumers, orphans, and other manifest-derived facts. This path needs **no agent
   reasoning at all**: `scripts/topology` extracts the graph and renders a complete report from a
   deterministically synthesized spec.
2. **Target scorecard mode** (when a target is named): measure the graph against a *stated
   target architecture* — "how well are we tracking toward the architecture we said we wanted?"
   (not "find me refactors" — that is the sibling `improve-codebase-architecture` skill). This
   is the only path that needs the agent, because the target invariants and editorial judgement
   are irreducible.

## Instant path — no target (just run the app)

If the user wants a topology report, dependency-graph audit, package-graph inventory, or a raw
layering/cycle check **without** a named target, do not author anything. Run the launcher from
the workspace root:

```bash
skills/architecture-topology-report/scripts/topology          # extract, render, open
skills/architecture-topology-report/scripts/topology --no-open # render only; prints the path
```

It extracts the graph and renders a full report — verdict, declared-tier stack, interactive D3
graph, factual scorecard, finding cards, and a "first deeper-read" keystone — from a spec
synthesized straight from the JSON (`scripts/synthesize-spec.mjs`). No skill load, no spec
authoring, sub-second to launch. Pass through any `extract-graph` flag for a different workspace
(`--root`, `--kit`, `--api-needle`, `--src-dir`) or `--repo <name>` to override the header
title. Relay the printed HTML path to the user.

Only drop to the agent (the target path below) when the user names a target architecture.

## Target-scorecard path — a target was named

This is the only path where the agent authors content. A clean run is ~4 turns and **one** graph
extraction:

1. **One parallel batch:** run `extract-graph.mjs --pretty --out <tmp>/graph.json` (caches the
   JSON *and* prints the facts); read the supplied target docs (`objective.md` / `roadmap.md` /
   `orientation.md` + any named ADRs); read `scripts/example-spec.mjs` and only the
   "Spec contract" table in `references/HTML-REPORT.md`.
2. **≤2 targeted greps** for the few things the JSON can't see.
3. Write the spec, making the scorecard rows the target invariants.
4. `build-report.mjs --graph <tmp>/graph.json --spec <spec> --open`.

The detailed steps below expand each of these. (Steps 1–4 also describe the mechanics the
launcher automates for you in raw mode — read them when you need to understand or extend what
the synthesized spec contains.)

### 1. Load the target architecture, if supplied

If the user named a target, read the document(s) that define the intended end-state. If the
user named an objective, read its `objective.md` (the "Architecture Model" and "Completion
Criteria" sections carry the invariants), `roadmap.md` (what is done vs. pending), and
`orientation.md` (the standing rule). Follow ADR references — the target invariants usually
live there.

Extract the target into a checklist of **invariants** — testable statements like "the
dependency graph is acyclic", "below-SDK packages hold no domain", "every capability
exposes a command face", "package X must delete to zero". These become the report's
scorecard rows. Use the project's own vocabulary (from `CONTEXT.md` and the target doc)
for layer and seam names — don't invent your own.

If no target is supplied, do **not** author a spec and do **not** ask a blocking clarification
just to get one — run the launcher (the *Instant path* above). The synthesizer already applies
the neutral conventions a raw report needs: `targetName: "raw topology inventory"`, an intro
that says there is no target architecture, and no normative language ("drift", "on track",
"violates the architecture") except where the fact is directly encoded by package metadata
(declared-tier `tierViolations`). The rest of this section is the target-mode authoring detail.

### 2. Extract the real topology

Run the bundled script; it emits JSON with everything structural:

```bash
node <skill-dir>/scripts/extract-graph.mjs --pretty --out <tmp>/graph.json
```

`--out` tees the JSON to a file as well as stdout, so step 4 can pass `--graph <tmp>/graph.json`
and skip a second extraction — one invocation surfaces the facts *and* caches them.

Defaults are tuned for sdl-tools (`--root ts/packages`, `--kit @sdl/capability-kit`,
`--api-needle api`). Override the flags for a different workspace. The script reports, over
**runtime edges only** (`dependencies` + `peerDependencies`):

- `cycles` — strongly-connected components of size > 1. `[]` means acyclic. This is the
  headline test for "is the dependency graph clean".
- `fanOut` / `fanIn` — ranked. The top fan-out package is usually the intended
  highest-level consumer; high fan-in marks the load-bearing infra.
- `exposesApi` — which packages ship an `/api`-style export (the curated-seam convention).
- `apiOnly` — packages that expose *only* an API with no command/main face (an anomaly if
  the target says every capability needs a command face).
- `kitConsumers` — packages depending on the named substrate/kit (a proxy for "migrated to
  the gateway-injected pattern").
- `orphans` — zero runtime fan-in; unwired leaves, often the furthest from the model.
- `packages[name].loc` — approximate source size (meaningful TypeScript lines under the
  package's `src`, tests/blank/`//` excluded).
- `topologyCircles` / `circleGraph` — source topology circles discovered from root
  `src/*.ts` files plus one circle per `src/<component>/` directory. The report's graph
  defaults to package granularity; an in-report toggle drills down to these circles
  (nodes sized by circle LOC, placed in tier lanes, tier-hue shades per enclosing package),
  and clicking a package node zooms into that single package's internal circle graph.
  Override the source folder with `--src-dir`.

The script reads each workspace package's declared `sdl.tier`, validates it against the
canonical tier taxonomy (kept in sync with the style-guard `packageTierValues` /
`packageTierAllowedTargets` / `allowedPackageTierDebtEdges`), emits `packages[name].tier`, and
reports computed `tierViolations` over runtime package edges — each tagged `severity: "hard"`,
or `"debt"` when the offending edge is on the allowlist. It does not write the editorial
verdict. In target mode, map the measured facts to the target's invariants yourself (the
launcher's synthesizer does this mapping for raw mode). When you need finer detail than package-level manifest edges, prefer the extracted
`circleGraph` first; use targeted source greps only for questions the static circle graph does not
classify, such as whether a capability import is intentionally through `/api` or an internal-looking
subpath.

**This JSON is the evidence base** — it already answers most scorecard rows (`cycles`,
`tierViolations`, `kitConsumers`, `exposesApi`, `apiOnly`, `orphans`,
`fanOut`/`fanIn`) directly. Read it once and lean on it; don't drift into open-ended
investigation. Only two kinds of question need a grep: **subpath cleanliness** (`/api` vs.
internals, as above) and **non-manifest facts** (e.g. is a guard wired into the default
validation lane?). Cap it at a couple of targeted greps — this is evidence *confirmation*, not
investigation. A topology report reads manifests, never behavior, so **never run the test suite
or `just` to gather evidence**; read the relevant config / justfile files directly instead.

### 3. Map facts to invariants or inventory rows

In target mode, for each target invariant, find the supporting fact and assign a status. Keep
statuses honest and few: `holds` (green), `partial` / `N of M` (amber), `open` / `blocked` /
`gap` (red). Cite the concrete evidence (the cycle members, the consumer count, the leaking
subpaths) — a status with no evidence is noise.

Raw inventory mode does this mapping deterministically (in `scripts/synthesize-spec.mjs`): it
turns `cycles`, hard/debt `tierViolations`, top fan-in/fan-out, `exposesApi`/`apiOnly`,
`kitConsumers`, and `orphans` into factual scorecard rows with descriptive statuses (`none`,
`N packages`, `top fan-out`, …), renders the notable facts as finding cards, and picks a "first
deeper-read" keystone (the largest/most-connected/cyclic/tier-violating node). You only do this
by hand in target mode; if a raw report needs a reading the synthesizer omits, extend that
module rather than authoring a one-off spec.

In target mode, look specifically for:

- **Cycles** — every SCC is debt against an acyclicity invariant, even ones the target doc
  explicitly defers.
- **Migration distance vs. drift** — distance is "not yet migrated"; drift is "actively wrong".
  Keep them distinct, and lean on the metadata-encoded `severity: "hard"` vs. `"debt"` split.
- **The keystone** — name the single move that unblocks the most invariants at once.

### 4. Render the HTML report

**Use the bundled generator — do not hand-build the HTML.** `scripts/build-report.mjs`
owns everything mechanical and repeated (the D3 renderer, the HTML scaffold, every
section's markup, the `{nodes, links}` assembly, declared-tier lookup, cycle-edge marking,
fan-in/out). You author only a compact **content spec** — optional tier overrides plus the
editorial judgement (verdict, scorecard rows, finding cards, keystone) — and the script
renders the page, writes it to the OS temp dir, and (with `--open`) opens it.

```bash
# (a) inspect the declared tier map, or copy entries only when you need overrides:
node <skill-dir>/scripts/build-report.mjs --tiers-template            # prints declared {pkg: tier}
# (b) write a spec module (see references/HTML-REPORT.md "Spec contract"), then render:
node <skill-dir>/scripts/build-report.mjs --graph <tmp>/graph.json --spec /abs/path/report-spec.mjs --open
```

Always pass `--graph <tmp>/graph.json` (the cache from step 2) so the generator renders from the
already-extracted graph instead of re-running `extract-graph.mjs`. It still falls back to
auto-extraction when `--graph` is absent (pass through `--root`/`--kit`/… for a different
workspace). `--spec` is **optional**: omit it and `build-report.mjs` synthesizes the raw
inventory spec deterministically (this is exactly what the `topology` launcher does) — supply
`--spec` only for a target scorecard. It prints the absolute output path; relay it to the user.
The only per-run thinking is the spec: whether any package tier needs an explicit report-only
override, and the invariant analysis from step 3.

To author the spec, work from `scripts/example-spec.mjs` (a complete, validated template)
plus the "Spec contract" table in
[references/HTML-REPORT.md](references/HTML-REPORT.md) — the rest of that reference is the
generator-owned D3 scaffold and design rationale, which you don't need to read to write a spec.
The full field list and section sequence live there if you need them. The report mixes three visual
registers so it reads as editorial, not as a generic dashboard: the interactive **D3 graph**
(package view by default — runtime edges, node fill = tier — with a subpackage-circle drill-down
toggle — static import edges, tier-hue fills shaded per enclosing package — and click-to-zoom on a
package node to isolate that package's internal circle graph; node area ∝ LOC, tier lanes/filters,
layered-DAG / tier-clustered / force layout toggle, drag/zoom/hover-trace), **Mermaid** before/after cycle diagrams
in finding cards, and **hand-built Tailwind** for the tier stack, verdict strip, and scorecard. Tier
presentation comes from declared `sdl.tier`; package color is separate from tier. The generator marks
an edge `cycle: true` when both endpoints sit in a circle/package SCC.

Only drop to a hand-built page (the raw scaffold is still in the reference) if a report needs
a register the spec does not express — and prefer extending `build-report.mjs` over a one-off.

### 5. Summarize in chat

Give the user the path, the scorecard/inventory verdict in a compact table, the keystone
recommendation (target mode) or first deeper-read recommendation (raw inventory mode), and any
sharp loose ends (an orphan capability, an api-only package, a declared tier violation, a debt
edge from a package that is supposed to disappear when a target says so). Offer to drill into
any finding.

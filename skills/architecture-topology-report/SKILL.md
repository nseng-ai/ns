---
name: architecture-topology-report
disable-model-invocation: true
description: Build a self-contained HTML report that maps a workspace's package dependency topology against a target architecture and scores how well it is tracking toward it. Use when someone wants a topology report, a dependency-graph or package-graph audit, a layering/cycle check, or to see how close a monorepo is to a stated architectural end-state (e.g. an objective's target, an ADR's layering rules). Reaches for the bundled extract-graph script rather than re-deriving the graph by hand.
metadata:
  internal: true
---

# Architecture Topology Report

Produce a **topology scorecard**: the actual runtime package dependency graph of a
workspace, rendered as an editorial HTML report and measured against a *stated target
architecture*. The question this answers is "how well are we tracking toward the
coherent architecture we said we wanted?" — not "find me refactors" (that is the
sibling `improve-codebase-architecture` skill).

Two inputs, always:

1. **The graph as it is** — extracted deterministically from `package.json` files by the
   bundled script. Never eyeball this; the script is faster and correct.
2. **The target as it should be** — prose the agent reads: an objective's `objective.md`
   / `roadmap.md` / `orientation.md`, an ADR, or whatever the user names. The whole
   point is the *gap* between the two, so you must actually load the target, not assume one.

## Process

### 1. Load the target architecture

Read the document(s) that define the intended end-state. If the user named an objective,
read its `objective.md` (the "Architecture Model" and "Completion Criteria" sections carry
the invariants), `roadmap.md` (what is done vs. pending), and `orientation.md` (the
standing rule). Follow ADR references — the target invariants usually live there.

Extract the target into a checklist of **invariants** — testable statements like "the
dependency graph is acyclic", "below-SDK packages hold no domain", "every capability
exposes a command face", "package X must delete to zero". These become the report's
scorecard rows. Use the project's own vocabulary (from `CONTEXT.md` and the target doc)
for layer and seam names — don't invent your own.

### 2. Extract the real topology

Run the bundled script; it emits JSON with everything structural:

```bash
node <skill-dir>/scripts/extract-graph.mjs --pretty
```

Defaults are tuned for sdl-tools (`--root ts/packages`, `--kit @sdl/capability-kit`,
`--transitional @sdl/domain-primitives-transitional`, `--api-needle api`). Override the
flags for a different workspace. The script reports, over **runtime edges only**
(`dependencies` + `peerDependencies`):

- `cycles` — strongly-connected components of size > 1. `[]` means acyclic. This is the
  headline test for "is the dependency graph clean".
- `fanOut` / `fanIn` — ranked. The top fan-out package is usually the intended
  highest-level consumer; high fan-in marks the load-bearing infra.
- `exposesApi` — which packages ship an `/api`-style export (the curated-seam convention).
- `apiOnly` — packages that expose *only* an API with no command/main face (an anomaly if
  the target says every capability needs a command face).
- `kitConsumers` — packages depending on the named substrate/kit (a proxy for "migrated to
  the gateway-injected pattern").
- `transitionalConsumers` — who still depends on a holding-pen package that is supposed to
  reach zero (completion-marker blockers).
- `orphans` — zero runtime fan-in; unwired leaves, often the furthest from the model.
- `packages[name].loc` — approximate source size (meaningful TypeScript lines under the
  package's `src`, tests/blank/`//` excluded). The report sizes graph nodes by this so a
  package's visual weight matches its heft. Override the source folder with `--src-dir`.

The script is purely structural by design — it does **not** classify layers or judge
anything, because the layer definitions and the verdict live in the target prose that only
you read. When you need finer detail than package-level edges (e.g. "does ccc import a
capability through `/api` or through internals?"), grep the consumer's `src` for the
import subpaths — package-level edges tell you *that* an edge exists, subpath grep tells you
*whether it is clean*.

### 3. Map facts to invariants

For each target invariant, find the supporting fact and assign a status. Keep statuses
honest and few: `holds` (green), `partial` / `N of M` (amber), `open` / `blocked` / `gap`
(red). Cite the concrete evidence (the cycle members, the consumer count, the leaking
subpaths) — a status with no evidence is noise.

Look specifically for:

- **Cycles** — every SCC is debt against an acyclicity invariant, even ones the target
  doc explicitly defers. Surface deferred cycles as such ("acknowledged debt"), don't hide
  them — they are usually the last thing between the graph and the invariant.
- **Migration distance vs. drift** — distinguish "the layering is wrong" (architectural
  drift, serious) from "most capabilities just haven't been migrated yet" (distance,
  expected mid-flight). Say which one you are looking at; they have very different fixes.
- **The keystone** — the single move that unblocks the most invariants at once (often a
  package that sits inside a cycle *and* is mid-migration). That becomes the top
  recommendation.

### 4. Render the HTML report

**Use the bundled generator — do not hand-build the HTML.** `scripts/build-report.mjs`
owns everything mechanical and repeated (the D3 renderer, the HTML scaffold, every
section's markup, the `{nodes, links}` assembly, cycle-edge marking, fan-in/out). You
author only a compact **content spec** — the tier map plus the editorial judgement (verdict,
scorecard rows, finding cards, keystone) — and the script renders the page, writes it to the
OS temp dir, and (with `--open`) opens it.

```bash
# (a) seed the tier map from structural facts, then re-tag sdk/host/cons/util by the model:
node <skill-dir>/scripts/build-report.mjs --tiers-template            # prints a {pkg: tier} seed
# (b) write a spec module (see references/HTML-REPORT.md "Spec contract"), then render:
node <skill-dir>/scripts/build-report.mjs --spec /abs/path/report-spec.mjs --open
```

The generator re-runs `extract-graph.mjs` itself (pass through `--root`/`--kit`/… for a
different workspace), or accepts a cached `--graph <json>`. It prints the absolute output
path; relay it to the user. The only per-run thinking is the spec: tier per package (one
seed away) and the invariant analysis from step 3.

The spec contract, every field, and the full section sequence live in
[references/HTML-REPORT.md](references/HTML-REPORT.md). The report mixes three visual
registers so it reads as editorial, not as a generic dashboard: the interactive **D3 graph**
(node area ∝ LOC, layered-DAG ⇄ force toggle, drag/zoom/hover-trace/tier-filter), **Mermaid**
before/after cycle diagrams in finding cards, and **hand-built Tailwind** for the tier stack,
verdict strip, and scorecard. You assign each node its tier (the extractor does not classify
layers); the generator marks an edge `cycle: true` when both endpoints sit in a `cycles` SCC.

Only drop to a hand-built page (the raw scaffold is still in the reference) if a report needs
a register the spec does not express — and prefer extending `build-report.mjs` over a one-off.

### 5. Summarize in chat

Give the user the path, the scorecard verdict in a compact table, the keystone
recommendation, and any sharp loose ends (an orphan capability, an api-only package, a
debt edge from a package that is supposed to disappear). Offer to drill into any finding.

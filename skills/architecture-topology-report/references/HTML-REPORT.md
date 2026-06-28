# HTML Report Format — Topology Scorecard

A single self-contained HTML file in the OS temp dir. Tailwind and Mermaid both via CDN.
Mermaid handles the graph-shaped visuals (the actual dependency graph, cycle subgraphs);
hand-built Tailwind divs handle the editorial visuals (the layered north-star stack, the
verdict strip, the scorecard table). Mix the two — a report that is all Mermaid reads as a
generic dependency dump, which is exactly what this is not.

This report has a fixed spine. Follow the section order; it tells a story —
*here is the target → here is reality → here is the gap → here is what to do first.*

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Package topology — {{repo}} vs. {{target name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose", flowchart: { curve: "basis" } });
    </script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
      .tier-label { writing-mode: vertical-rl; transform: rotate(180deg); }
      .chip { font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans antialiased">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-14">
      <header>...</header>          <!-- 1 -->
      <section id="verdict">...</section>        <!-- 2 -->
      <section id="north-star">...</section>     <!-- 3 -->
      <section id="actual-graph">...</section>   <!-- 4 -->
      <section id="scorecard">...</section>      <!-- 5 -->
      <section id="findings">...</section>       <!-- 6 -->
      <section id="top-recommendation">...</section> <!-- 7 -->
    </main>
  </body>
</html>
```

## 1. Header + legend

Repo name, the target doc it is measured against (with the ADR refs), date, and a compact
legend mapping every visual encoding used in the graph: one swatch per layer, plus
`red line = cycle edge`, `dashed amber = debt / transitional edge`. State the scope:
package count and that edges are runtime (`dependencies` + `peerDependencies`) only.

## 2. Verdict strip

A row of 3–4 stat cards (`grid grid-cols-2 md:grid-cols-4`) with the numbers that decide
the verdict: cycle count, `kit-adopted / total`, `api-exposed / total`, transitional
consumer count. Big tabular number (`text-3xl chip`), colored by health (emerald/amber/red),
with a one-line label. Follow with one plain-English paragraph that names the overall read —
crucially, whether the gap is **architectural drift** (layering is wrong) or **migration
distance** (layering is right, work is unfinished). They look similar in a graph and mean
opposite things.

## 3. North star — the target model

A hand-built layered stack (NOT Mermaid) showing the intended tiers as horizontal bands
with a vertical `.tier-label`, each band listing its packages as `font-mono` chips. This is
the editorial centrepiece — it shows the architecture *as designed*, so the reader has the
ideal in their eye before seeing reality. Color bands by tier (slate = infra, indigo = SDK,
emerald = capabilities). Flag any package destined for deletion with a dashed amber chip and
a "must delete to zero" note. One sentence above it states the governing rule (e.g. "edges
point down; the graph must be acyclic").

## 4. The graph as it stands — Mermaid

The actual dependency graph, **curated** to the architecturally load-bearing nodes and
edges — omit off-axis tooling, name it in the caption. This is where Mermaid earns its
place. Conventions:

- `classDef` per layer, colors matching the north-star bands.
- Node shapes encode role: `[infra]`, `([capability])`, `{{consumer/host}}`, dashed for the
  transitional package.
- **Cycle edges in red** via `linkStyle <indices> stroke:#dc2626,stroke-width:2.5px`. Count
  the link declarations in order to get the indices right (Mermaid numbers links 0..n in
  source order). Label each debt edge with *why* it is debt (`-.->|internals|`,
  `-.->|"@sdl/sdl/context"|`).
- Caption below spells out the cycle path in words so it survives a Mermaid render failure.

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart TD
      sdl["@sdl/sdl (kernel)"]:::sdk
      bctx([branch-context]):::cap
      pi{{pi · host}}:::cons
      sdl --> autobranch
      autobranch --> pi
      pi --> sdl
      pi --> bctx
      bctx --> pi
      classDef sdk fill:#c7d2fe,stroke:#6366f1;
      classDef cap fill:#bbf7d0,stroke:#10b981;
      classDef cons fill:#1e293b,stroke:#0f172a,color:#f8fafc;
      linkStyle 0,1,2,3,4 stroke:#dc2626,stroke-width:2.5px;
  </pre>
</div>
```

## 5. Scorecard table

One row per target invariant. Columns: **Invariant** (plain restatement of the target rule),
**Status** (a colored pill — `holds` emerald / `partial` or `N/M` amber / `open`/`blocked`/`gap`
red), **Evidence** (the concrete fact: cycle members, consumer count, leaking subpaths). This
table is the heart of the report; everything else supports it. Keep statuses few and honest —
do not invent a fourth color.

## 6. Finding cards

One `<article>` per material gap, ordered by leverage. Each card:

- **Title** naming the gap, a strength badge (`Strong` emerald / `Worth watching` amber /
  `Speculative` slate), and an optional category tag (`acyclicity blocker`, `completion marker`).
- For a cycle or a fixable structure, a **before/after** pair of small Mermaid diagrams (now =
  red SCC, after = the cut that breaks it). For an adoption gap, a row of mono chips
  (done = emerald, pending = grey). For a "who still depends on X" finding, a small fan-in
  Mermaid.
- **Problem** — one sentence. **Solution** — one sentence, in the project's vocabulary.
- **Wins** — bullets, ≤6 words, named in architecture terms (`locality`, `leverage`, "graph
  goes acyclic"), not "cleaner code".
- For deferred/acknowledged debt, an amber callout saying so — surface it without pretending
  it is a surprise.

## 7. Top recommendation

One larger dark card (`.deep`, light text). Name the single keystone move — the one that
unblocks the most invariants — and explain the chain: why this one first, what it
unblocks, what becomes downstream of it. End with the sequence (this → then → then). That's
it; no second recommendation competing for the slot.

## Style

- Editorial, not corporate-dashboard. Generous whitespace, `font-serif` headings over
  stone/slate, one accent plus red (cycles/blockers) and amber (debt/warnings).
- `text-xs uppercase tracking-wider` for tier and module labels — schematic, not UI.
- Keep before/after Mermaid pairs short so they sit side by side without scrolling.
- The only scripts are the two CDNs. No app code, no interactivity beyond Mermaid.

## Tone and vocabulary

Plain, concise, and faithful to the project's own terms (from `CONTEXT.md` and the target
doc) and the `/codebase-design` glossary for architecture nouns: **module, interface,
seam, adapter, leverage, locality, depth**. Say **module** not component/service; **seam**
not boundary. Distinguish **drift** (wrong) from **distance** (unfinished) explicitly —
that distinction is the most useful thing the report says. No hedging, no throat-clearing;
if a sentence could be a bullet, make it a bullet.

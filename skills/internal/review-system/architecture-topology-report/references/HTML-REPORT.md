# HTML Report Format — Topology Scorecard

> **Default path: `scripts/build-report.mjs`.** Do not hand-assemble the HTML. The
> generator bakes the D3 renderer, the scaffold, and every section below, and turns a
> compact **content spec** into the page. Author the spec (next section); the rest of this
> document is the design rationale and the field-by-field reference for what the spec must
> supply. The raw copy-paste scaffold remains here only as the fallback for a register the
> spec cannot express.

## Table of Contents

- [Spec contract (`--spec <module.mjs>`)](#spec-contract---spec-modulemjs)
- [Scaffold](#scaffold)
- [1. Header + legend](#1-header--legend)
- [2. Verdict strip](#2-verdict-strip)
- [3. North star — the target model](#3-north-star--the-target-model)
- [4. The graph as it stands — interactive D3 force/DAG graph](#4-the-graph-as-it-stands--interactive-d3-forcedag-graph)
- [5. Scorecard table](#5-scorecard-table)
- [6. Finding cards](#6-finding-cards)
- [7. Top recommendation](#7-top-recommendation)
- [Style](#style)
- [Tone and vocabulary](#tone-and-vocabulary)

## Spec contract (`--spec <module.mjs>`)

An ESM module with a `default` export. The generator reads each package's declared
`ns.tier`, applies any report-only tier overrides, computes fan-in/out, marks cycle edges,
and renders. You provide:

| Field                          | Shape                                                                                              | Notes                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo`, `targetName`, `date`   | string                                                                                             | header identity                                                                                                                                                                                                       |
| `intro`                        | html string                                                                                        | one paragraph under the title                                                                                                                                                                                         |
| `tiers?`                       | `{ "<pkg>": "<tierId>" }`                                                                          | optional report-only overrides. Canonical tier ids: `extension extension-kit sdk neutral-infra host standalone-tool internal-tool`. Omit this field to use declared package tiers. Invalid override values fail fast. |
| `verdict`                      | `{ headline, drift:bool, stats:[{value,total?,label,sub,health}], read }`                          | `health`: `green\|amber\|red`. `drift:false` ⇒ the green "distance not drift" framing.                                                                                                                                |
| `northStar`                    | `{ rule, bands:[{label,bg,labelBg,chipBorder,noteColor,packages,note}], offAxis? }`                | `packages` items are strings or `{name,dashed}` (dashed = "delete to zero").                                                                                                                                          |
| `graphIntro?`, `graphCaption?` | html string                                                                                        | the LOC-reading prose under the graph                                                                                                                                                                                 |
| `scorecard`                    | `[{invariant, status, statusKind, evidence}]`                                                      | `statusKind`: `holds\|partial\|open` (drives the pill colour).                                                                                                                                                        |
| `findings`                     | `[{title, strength, tag?, problem, solution, wins[], debtNote?, beforeAfter?\|fanin?\|chipRows?}]` | `strength`: `Strong\|Worth watching\|Speculative`. `beforeAfter:{now,after,nowLabel?,afterLabel?}` and `fanin` are Mermaid source; `chipRows:[{label,items:[{text,state}]}]` with `state: done\|pending\|neutral`.    |
| `keystone`                     | `{ title, paras[], sequence[] }`                                                                   | `sequence[0]` is highlighted emerald.                                                                                                                                                                                 |
| `provenance?`                  | html string                                                                                        | footer line                                                                                                                                                                                                           |

Fields ending in prose accept inline HTML verbatim (it is not escaped) so you can drop
`<span class="font-mono">` etc. Package labels in the graph are auto-shortened (scope prefix
stripped). A validated example spec that reproduces the sdl-extension-architecture report is
the fastest way to start — copy its shape and replace the content.

---

A single self-contained HTML file in the OS temp dir. Tailwind, D3, and Mermaid via CDN.
Three visual registers, each for what it does best:

- **D3 force/DAG graph** (section 4) — the *actual* full dependency graph, interactive:
  node area ∝ source LOC, drag/zoom/hover-trace/tier-filter, and a three-way layout toggle
  (layered-DAG / tier-clustered / force). This is the centrepiece "reality" view.
- **Mermaid** (section 6 finding cards only) — the small before/after cycle diagrams,
  where a fixed two-node-cut schematic reads better than a physics sim.
- **Hand-built Tailwind divs** — the editorial visuals: the layered north-star stack, the
  verdict strip, the scorecard table.

Mix the three — a report that is all one register reads as a generic dependency dump,
which is exactly what this is not.

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
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
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
legend mapping every visual encoding used in the graph: one swatch per declared package
tier, plus `red line = cycle edge` and `node area ∝ LOC`. State the scope: package count and
that edges are runtime (`dependencies` + `peerDependencies`) only.

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
ideal in their eye before seeing reality. Color bands by canonical tier (neutral infra,
SDK, extension kit, extensions, hosts, tools, transitional). Flag any package destined for
deletion with a dashed amber chip and
a "must delete to zero" note. One sentence above it states the governing rule (e.g. "edges
point down; the graph must be acyclic").

## 4. The graph as it stands — interactive D3 force/DAG graph

The actual dependency graph, rendered live with D3 (not Mermaid). Unlike a static diagram,
the interactive graph can hold **every** node — zoom, hover-trace, and tier-filter handle
the clutter, so you do not have to curate down to a hand-picked subgraph. Name the off-axis
tools in the caption rather than deleting them; the tier filter lets the reader drop them.

What it must do:

- **Node area ∝ LOC.** Radius via `d3.scaleSqrt().domain([0, maxLoc]).range([0, ~50])`, so
  *area* (not radius) tracks `loc` — the visual heft of a package matches its real heft.
  `loc` comes straight from the script's `packages[name].loc`.
- **Color = tier**, swatches matching the north-star bands. The extractor reads declared
  `ns.tier` from package manifests; the spec may override individual packages only when a
  report needs a deliberate presentation exception.
- **Cycle edges in red** with an arrowhead, drawn against the layout flow. Mark a link
  `cycle: true` when its `source→target` pair appears inside any SCC from the script's
  `cycles`. In the layered view a red edge visibly points *upward* — that *is* the violation.
- **Layout toggle (three modes).** Default to **Layered (DAG)**: rank each node by longest
  dependency path (cycle edges excluded from ranking so it stays a DAG), pin `forceY` to the
  rank — consumers on top, neutral infra at the bottom, mirroring the north-star tiers.
  **Clustered (tiers)** groups same-tier nodes into horizontal swimlanes stacked by the tier's
  *mean* DAG depth, so the clusters broadly stack in dependency order (consumers up, neutral
  infra down) and cross-tier edges read as the lines that jump bands. **Force** is the organic
  spring layout for comparison.
- **Interactions:** drag (pins a node), scroll-zoom + background-pan, hover a node to trace
  its direct dependencies/dependents (fade the rest, tooltip with tier · LOC · rank ·
  fan-in/out), clickable tier chips to toggle whole layers, and a reset.
- A **caption** spells out the cycle path in words so it survives if the script fails to run.

**Data prep.** `build-report.mjs` builds the `{nodes, links}` object from the script JSON
and embeds it in `<script type="application/json" id="graphdata">`. For each package it
emits `{id, label, loc, tier, fanIn, fanOut}` (`loc` and declared `tier` from
`packages[]`; `fanIn`/`fanOut` recomputed from the graph). For each runtime edge it emits
`{source, target, cycle}`. Labels are shortened for readability (scope prefix stripped).

The full, self-contained renderer — drop it in after the `#graphdata` script tag:

```html
<div class="flex flex-wrap items-center gap-3">
  <div id="layout-toolbar" class="flex items-center gap-1 text-xs"></div>
  <div id="tier-toolbar" class="flex flex-wrap items-center gap-2 text-xs"></div>
</div>
<div class="relative rounded-lg border border-slate-200 bg-white">
  <svg id="depgraph" class="w-full" style="height:820px; display:block; cursor:grab;"></svg>
  <div id="g-tip" class="pointer-events-none absolute hidden rounded-md bg-slate-900/95 text-slate-100 text-xs px-3 py-2 shadow-lg leading-relaxed" style="max-width:260px"></div>
</div>
<script>
(function(){
  const DATA = JSON.parse(document.getElementById("graphdata").textContent);
  // Order tiers top→bottom; colors match the north-star bands.
  const TIERS = {
    extension:{fill:"#bbf7d0",stroke:"#10b981",name:"extension"},
    "extension-kit":{fill:"#d9f99d",stroke:"#65a30d",name:"extension kit"},
    sdk:{fill:"#c7d2fe",stroke:"#6366f1",name:"SDK"},
    transitional:{fill:"#fef3c7",stroke:"#d97706",name:"transitional"},
    "neutral-infra":{fill:"#cbd5e1",stroke:"#64748b",name:"neutral infra"},
    host:{fill:"#475569",stroke:"#0f172a",name:"presentation host"},
    "standalone-tool":{fill:"#f1f5f9",stroke:"#94a3b8",name:"standalone tool"},
    "internal-tool":{fill:"#e7e5e4",stroke:"#a8a29e",name:"internal tool"},
  };
  const svg = d3.select("#depgraph"), el = svg.node();
  let W = el.clientWidth || 900, H = 820;
  svg.attr("viewBox", [0,0,W,H]);

  const maxLoc = d3.max(DATA.nodes, d=>d.loc);
  const r = d3.scaleSqrt().domain([0,maxLoc]).range([0,50]);   // area ∝ loc
  DATA.nodes.forEach(n=>n.r=Math.max(4,r(n.loc)));

  // layered ranks: longest path, cycle edges excluded so it's a DAG
  const parents = new Map(DATA.nodes.map(n=>[n.id,[]]));
  DATA.links.forEach(l=>{ if(!l.cycle){ const s=l.source.id||l.source, t=l.target.id||l.target; parents.get(t).push(s);} });
  const memo=new Map();
  function depthOf(id){ if(memo.has(id))return memo.get(id); let d=0; for(const p of parents.get(id)) d=Math.max(d,depthOf(p)+1); memo.set(id,d); return d; }
  DATA.nodes.forEach(n=>n.depth=depthOf(n.id));
  const maxDepth=d3.max(DATA.nodes,d=>d.depth)||1;
  const layerY=d=>50+(d.depth/maxDepth)*(H-100);
  DATA.nodes.forEach(n=>{ n.y=layerY(n); n.x=W/2+(Math.random()-0.5)*W*0.6; });

  // tier clustering stacked in DAG order: order tiers by mean dependency depth and give each a swimlane
  const tierDepthSum=new Map(), tierCount=new Map();
  DATA.nodes.forEach(n=>{ tierDepthSum.set(n.tier,(tierDepthSum.get(n.tier)||0)+n.depth); tierCount.set(n.tier,(tierCount.get(n.tier)||0)+1); });
  const meanDepth=t=>tierDepthSum.get(t)/tierCount.get(t);
  const presentTiers=[...tierCount.keys()].sort((a,b)=>meanDepth(a)-meanDepth(b));
  const tierBand=new Map(presentTiers.map((t,i)=>[t,i])), nBands=Math.max(1,presentTiers.length);
  const bandSpan=()=>(H-120)/nBands, bandY=t=>60+(tierBand.get(t)+0.5)*bandSpan();

  const defs=svg.append("defs");
  [["arrow","#94a3b8"],["arrow-cy","#dc2626"]].forEach(([id,col])=>{
    defs.append("marker").attr("id",id).attr("viewBox","0 -5 10 10").attr("refX",9).attr("refY",0)
      .attr("markerWidth",6).attr("markerHeight",6).attr("orient","auto")
      .append("path").attr("d","M0,-5L10,0L0,5").attr("fill",col);
  });
  const root=svg.append("g");
  const linkSel=root.append("g").attr("fill","none").selectAll("line").data(DATA.links).join("line")
    .attr("stroke",d=>d.cycle?"#dc2626":"#cbd5e1").attr("stroke-width",d=>d.cycle?2.4:1)
    .attr("marker-end",d=>d.cycle?"url(#arrow-cy)":"url(#arrow)");
  const nodeG=root.append("g").selectAll("g").data(DATA.nodes).join("g").style("cursor","pointer").call(drag());
  nodeG.append("circle").attr("r",d=>d.r).attr("fill",d=>TIERS[d.tier].fill).attr("stroke",d=>TIERS[d.tier].stroke)
    .attr("stroke-width",1.4).attr("stroke-dasharray",d=>d.tier==="transitional"?"4 3":null);
  nodeG.append("text").text(d=>d.label).attr("text-anchor","middle").attr("dy",d=>d.r+11)
    .attr("font-size",d=>Math.max(9,Math.min(13,8+d.r/6))).attr("fill","#334155")
    .attr("paint-order","stroke").attr("stroke","#f8fafc").attr("stroke-width",3);

  // per-tier cluster captions, shown only in the clustered layout
  const clusterLabels=root.append("g").attr("pointer-events","none").style("display","none");
  const clusterText=clusterLabels.selectAll("text").data(presentTiers).join("text")
    .attr("text-anchor","middle").attr("font-size",12).attr("font-weight",700)
    .attr("fill",t=>TIERS[t].stroke).attr("paint-order","stroke").attr("stroke","#f8fafc").attr("stroke-width",4)
    .style("text-transform","uppercase").style("letter-spacing","0.08em").text(t=>TIERS[t].name);

  const sim=d3.forceSimulation(DATA.nodes).on("tick",tick);
  function tick(){
    linkSel.each(function(d){
      const dx=d.target.x-d.source.x, dy=d.target.y-d.source.y, dist=Math.hypot(dx,dy)||1, ux=dx/dist, uy=dy/dist;
      d.x1=d.source.x+ux*d.source.r; d.y1=d.source.y+uy*d.source.r;
      d.x2=d.target.x-ux*(d.target.r+5); d.y2=d.target.y-uy*(d.target.r+5);
    });
    linkSel.attr("x1",d=>d.x1).attr("y1",d=>d.y1).attr("x2",d=>d.x2).attr("y2",d=>d.y2);
    nodeG.attr("transform",d=>`translate(${d.x},${d.y})`);
  }

  let mode="layered";
  function setLayout(m){
    mode=m;
    d3.selectAll(".layout-btn").style("opacity",function(){return this.dataset.mode===m?1:0.4;})
      .style("font-weight",function(){return this.dataset.mode===m?600:400;});
    sim.force("link",d3.forceLink(DATA.links).id(d=>d.id)
         .distance(d=>m==="force"?(r(d.source.loc)+r(d.target.loc)+46):(m==="clustered"?46:70))
         .strength(m==="clustered"?0.02:(m==="layered"?0.05:0.35)))
       .force("collide",d3.forceCollide().radius(d=>d.r+7).strength(0.92));
    if(m==="layered") sim.force("charge",d3.forceManyBody().strength(d=>-90-d.r*5))
                         .force("x",d3.forceX(W/2).strength(0.05)).force("y",d3.forceY(d=>layerY(d)).strength(1.0));
    else if(m==="clustered") sim.force("charge",d3.forceManyBody().strength(d=>-70-d.r*4))
                         .force("x",d3.forceX(W/2).strength(0.12)).force("y",d3.forceY(d=>bandY(d.tier)).strength(0.94));
    else              sim.force("charge",d3.forceManyBody().strength(d=>-170-d.r*9))
                         .force("x",d3.forceX(W/2).strength(0.05)).force("y",d3.forceY(H/2).strength(0.07));
    clusterLabels.style("display",m==="clustered"?null:"none");
    if(m==="clustered") clusterText.attr("x",W/2).attr("y",t=>Math.max(16,bandY(t)-bandSpan()*0.5+13));
    sim.alpha(0.9).restart();
  }
  const zoom=d3.zoom().scaleExtent([0.3,4]).on("zoom",e=>root.attr("transform",e.transform));
  svg.call(zoom);

  const nbr=new Map(DATA.nodes.map(n=>[n.id,new Set([n.id])]));
  DATA.links.forEach(l=>{ const s=l.source.id||l.source,t=l.target.id||l.target; nbr.get(s).add(t); nbr.get(t).add(s); });
  const tip=d3.select("#g-tip"), active=new Set(Object.keys(TIERS));
  const vis=d=>active.has(d.tier), lvis=l=>active.has(l.source.tier)&&active.has(l.target.tier);
  nodeG.on("mouseover",(e,d)=>{
      const near=nbr.get(d.id);
      nodeG.style("opacity",n=>vis(n)?(near.has(n.id)?1:0.12):0);
      linkSel.style("opacity",l=>lvis(l)&&(l.source.id===d.id||l.target.id===d.id)?1:(lvis(l)?0.05:0))
             .attr("stroke",l=>(l.source.id===d.id||l.target.id===d.id)?(l.cycle?"#dc2626":"#475569"):(l.cycle?"#dc2626":"#cbd5e1"))
             .attr("stroke-width",l=>(l.source.id===d.id||l.target.id===d.id)?(l.cycle?2.6:1.8):(l.cycle?2.4:1));
      tip.html(`<div class="font-semibold">${d.id}</div><div class="text-slate-300">${TIERS[d.tier].name} · <span class="font-mono">${d.loc.toLocaleString()}</span> LOC · rank ${d.depth}</div><div class="text-slate-400 mt-1">fan-out ${d.fanOut} → · fan-in ← ${d.fanIn}</div>`).classed("hidden",false);
    })
    .on("mousemove",e=>{ const b=el.getBoundingClientRect(); tip.style("left",(e.clientX-b.left+14)+"px").style("top",(e.clientY-b.top+10)+"px"); })
    .on("mouseout",()=>{ tip.classed("hidden",true); applyFilter(); });

  const lt=d3.select("#layout-toolbar");
  lt.append("span").attr("class","uppercase tracking-wider text-slate-400 mr-1").text("layout:");
  [["layered","Layered (DAG)"],["clustered","Clustered (tiers)"],["force","Force"]].forEach(([m,label])=>
    lt.append("button").attr("class","layout-btn rounded-full border border-slate-300 px-2.5 py-0.5").attr("data-mode",m).text(label).on("click",()=>setLayout(m)));
  const tb=d3.select("#tier-toolbar");
  tb.append("span").attr("class","uppercase tracking-wider text-slate-400 mr-1").text("tiers:");
  Object.entries(TIERS).forEach(([k,v])=>{
    const b=tb.append("button").attr("data-tier",k).attr("class","inline-flex items-center gap-1 rounded-full border px-2 py-0.5").style("border-color",v.stroke);
    b.append("span").style("width","9px").style("height","9px").style("border-radius","2px").style("background",v.fill).style("border","1px solid "+v.stroke);
    b.append("span").text(v.name);
    b.on("click",function(){ active.has(k)?active.delete(k):active.add(k); d3.select(this).style("opacity",active.has(k)?1:0.35); applyFilter(); });
  });
  function applyFilter(){
    nodeG.style("opacity",d=>vis(d)?1:0.06).style("pointer-events",d=>vis(d)?"all":"none");
    linkSel.style("opacity",l=>lvis(l)?(l.cycle?0.95:0.5):0.02).attr("stroke",l=>l.cycle?"#dc2626":"#cbd5e1").attr("stroke-width",l=>l.cycle?2.4:1);
  }
  function drag(){ return d3.drag()
    .on("start",(e,d)=>{ if(!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
    .on("drag",(e,d)=>{ d.fx=e.x; d.fy=e.y; })
    .on("end",(e,d)=>{ if(!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }); }
  window.addEventListener("resize",()=>{ W=el.clientWidth||W; svg.attr("viewBox",[0,0,W,H]); setLayout(mode); });
  setLayout("layered"); applyFilter();
})();
</script>
```

Add a small `area ∝ LOC` size key (three nested circles) and a one-line "what the sizes
say" caption that calls out the heaviest package and any deliberately-tiny seam — the LOC
encoding earns its keep only if the prose reads it.

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
- Scripts are the three CDNs (Tailwind, D3, Mermaid) plus the self-contained D3 renderer in
  section 4 and the embedded `#graphdata`. No build step, no external data file — it opens
  straight from disk.

## Tone and vocabulary

Plain, concise, and faithful to the project's own terms (from `CONTEXT.md` and the target
doc) and the `/codebase-design` glossary for architecture nouns: **module, interface,
seam, adapter, leverage, locality, depth**. Say **module** not component/service; **seam**
not boundary. Distinguish **drift** (wrong) from **distance** (unfinished) explicitly —
that distinction is the most useful thing the report says. No hedging, no throat-clearing;
if a sentence could be a bullet, make it a bullet.

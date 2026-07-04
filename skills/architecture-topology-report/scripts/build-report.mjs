#!/usr/bin/env node
// Render a topology-scorecard HTML report from (a) the structural graph that
// extract-graph.mjs emits and (b) a compact, agent-authored *content spec*.
//
// This script owns everything MECHANICAL and REPEATED so a future run never
// hand-builds it again:
//   - runs/loads extract-graph and reuses its cycles / fan-in / fan-out / loc
//   - turns packages into graph nodes (tier read from package metadata, with optional spec overrides) and edges
//   - marks an edge `cycle:true` when both endpoints sit in a `cycles` SCC
//   - bakes the full D3 renderer + HTML scaffold + every section's markup
//
// The agent only supplies the IRREDUCIBLE editorial judgement: optional tier
// overrides, the verdict read, the scorecard rows, the finding cards, the
// keystone — as a plain data object. No copy-pasting the D3 renderer, no `${}`
// escaping, no re-deriving fan-in/out, no drift from the reference.
//
// Usage:
//   node build-report.mjs --spec <spec.mjs|spec.json> [--graph <graph.json>] [--open]
//                         [--tiers-template]   # print declared tier map and exit
//   plus any extract-graph flags (--root, --kit, --api-needle, --src-dir)
//
// Spec shape: see the `## Spec` block in references/HTML-REPORT.md (and the
// validated example the skill can emit). Minimal contract below.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FALLBACK_TIER, label, TIER_RANK, TIERS } from "./tiers.mjs";
import { synthesizeSpec } from "./synthesize-spec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const STATUS_KIND = {
  holds: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  open: "bg-red-100 text-red-700",
};
const HEALTH = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-600",
  amber: "border-amber-200 bg-amber-50 text-amber-600",
  red: "border-red-200 bg-red-50 text-red-600",
};
const STRENGTH = {
  Strong: "bg-emerald-100 text-emerald-700",
  "Worth watching": "bg-amber-100 text-amber-700",
  Speculative: "bg-slate-200 text-slate-600",
};

// ── tiny html helpers ──────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
// `html`: pass-through tag so editorial strings may contain inline markup verbatim.
const html = (strings, ...vals) => strings.reduce((a, s, i) => a + (vals[i - 1] ?? "") + s);

// ── 1. obtain the structural graph ─────────────────────────────────────────
function getAnalysis(args) {
  const gi = args.indexOf("--graph");
  if (gi !== -1) return JSON.parse(readFileSync(resolve(args[gi + 1]), "utf8"));
  // otherwise run the sibling extractor, passing through its flags
  const pass = [];
  for (const f of ["--root", "--kit", "--api-needle", "--src-dir"]) {
    const i = args.indexOf(f);
    if (i !== -1) pass.push(f, args[i + 1]);
  }
  const out = execFileSync("node", [join(HERE, "extract-graph.mjs"), "--pretty", ...pass], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

// ── 2. mechanical graph assembly: two granularities over the same analysis.
//        Package view (the default): one node per workspace package, runtime
//        manifest edges, fill = declared tier. Circle view (the drill-down):
//        one node per topology circle, static TS import edges, fill = enclosing
//        package. Legacy graph JSONs without circle facts render package-only.
//        Every node carries its own fill/stroke so the renderer never branches.
function validateTierOverrides(tierOverrides) {
  const invalidOverrides = Object.entries(tierOverrides || {}).filter(([, tier]) => !Object.hasOwn(TIERS, tier));
  if (invalidOverrides.length) {
    throw new Error(
      `Invalid spec.tiers override(s): ${invalidOverrides.map(([id, tier]) => `${id}=${tier}`).join(", ")}. Known tiers: ${Object.keys(TIERS).join(", ")}`,
    );
  }
}

function fanCounts(edgeGraph, ids) {
  const fanOut = new Map(ids.map((n) => [n, 0]));
  const fanIn = new Map(ids.map((n) => [n, 0]));
  for (const [src, deps] of Object.entries(edgeGraph)) {
    for (const d of deps) {
      fanOut.set(src, (fanOut.get(src) || 0) + 1);
      fanIn.set(d, (fanIn.get(d) || 0) + 1);
    }
  }
  return { fanOut, fanIn };
}

function assembleLinks(edgeGraph, cycleFacts) {
  // cycle:true only when both endpoints sit in the SAME strongly-connected
  // component — membership in two different SCCs is not a cycle edge.
  const sccIndex = new Map();
  cycleFacts.forEach((scc, i) => scc.forEach((id) => sccIndex.set(id, i)));
  const links = [];
  for (const [src, deps] of Object.entries(edgeGraph)) {
    for (const t of deps) {
      links.push({ source: src, target: t, cycle: sccIndex.has(src) && sccIndex.get(src) === sccIndex.get(t) });
    }
  }
  return links;
}

function assemblePackageGraph(analysis, tierOverrides = {}) {
  const ids = Object.keys(analysis.packages).sort();
  const { fanOut, fanIn } = fanCounts(analysis.graph, ids);
  const subpackageCounts = new Map();
  for (const fact of Object.values(analysis.topologyCircles ?? {})) {
    if (fact.component === ".") continue;
    subpackageCounts.set(fact.packageName, (subpackageCounts.get(fact.packageName) || 0) + 1);
  }
  const warnings = [];
  const nodes = ids.map((id) => {
    const pkg = analysis.packages[id];
    const declaredTier = tierOverrides[id] ?? pkg.tier;
    if (!Object.hasOwn(TIERS, declaredTier)) warnings.push(id);
    const tier = Object.hasOwn(TIERS, declaredTier) ? declaredTier : FALLBACK_TIER;
    return {
      id,
      label: label(id),
      loc: pkg.loc ?? 0,
      tier,
      path: pkg.path,
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOut.get(id) || 0,
      subpackageCount: subpackageCounts.get(id) || 0,
      fill: TIERS[tier].fill,
      stroke: TIERS[tier].stroke,
    };
  });
  return { graph: { nodes, links: assembleLinks(analysis.graph, analysis.cycles ?? []) }, warnings };
}

function assembleCircleGraph(analysis, tierOverrides = {}) {
  const circleFacts = analysis.topologyCircles;
  const ids = Object.keys(circleFacts).sort();
  const { fanOut, fanIn } = fanCounts(analysis.circleGraph, ids);
  const colors = circlePackageColors(circleFacts, tierOverrides);
  const warnings = [];
  const nodes = ids.map((id) => {
    const fact = circleFacts[id];
    const declaredTier = tierOverrides[id] ?? tierOverrides[fact.packageName] ?? fact.tier;
    if (!Object.hasOwn(TIERS, declaredTier)) warnings.push(id);
    return {
      id,
      label: label(id),
      loc: fact.loc ?? 0,
      tier: Object.hasOwn(TIERS, declaredTier) ? declaredTier : FALLBACK_TIER,
      packageName: fact.packageName,
      component: fact.component,
      isRoot: fact.component === ".",
      path: fact.path,
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOut.get(id) || 0,
      fill: colors[fact.packageName].fill,
      stroke: colors[fact.packageName].stroke,
    };
  });
  return { graph: { nodes, links: assembleLinks(analysis.circleGraph, analysis.circleCycles ?? []) }, warnings };
}

// Circle-view coloring: every circle stays inside its tier's color family (so the
// tier read matches the package view and the legend), and packages within a tier
// get distinct shades of that family — hue swept ±22° and lightness stepped around
// the tier base. Same-package circles share an exact shade, so they read as one
// group instead of the recycled-palette confetti a 21-package workspace produces.
function circlePackageColors(circleFacts, tierOverrides) {
  const pkgTier = new Map();
  for (const fact of Object.values(circleFacts)) {
    if (pkgTier.has(fact.packageName)) continue;
    const declared = tierOverrides[fact.packageName] ?? fact.tier;
    pkgTier.set(fact.packageName, Object.hasOwn(TIERS, declared) ? declared : FALLBACK_TIER);
  }
  const byTier = new Map();
  for (const [pkg, tier] of [...pkgTier.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(pkg);
  }
  const colors = {};
  for (const [tier, pkgs] of byTier) {
    pkgs.forEach((pkg, i) => {
      const t = pkgs.length === 1 ? 0 : i / (pkgs.length - 1) - 0.5;
      colors[pkg] = { fill: shiftColor(TIERS[tier].fill, t), stroke: shiftColor(TIERS[tier].stroke, t) };
    });
  }
  return colors;
}

function shiftColor(hex, t) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex({
    h: (h + t * 44 + 360) % 360,
    s,
    l: Math.min(0.94, Math.max(0.16, l + t * 0.16)),
  });
}

function hexToHsl(hex) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255, g = parseInt(v.slice(2, 4), 16) / 255, b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── 3. tier template: dump declared manifest tiers for review/optional override. ─
function tiersTemplate(analysis) {
  return Object.fromEntries(
    Object.entries(analysis.packages)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, pkg]) => [id, pkg.tier]),
  );
}

// ── 4. the baked D3 renderer (a real function; stringified into the page so
//        Node never escapes a thing and it can never drift from this source). ─
function GRAPH_RENDERER() {
  // DATA carries both granularities: { package: {nodes, links}, circle: {nodes, links} | null }.
  // The whole SVG lives inside build(viewKey) so the granularity toggle can tear it
  // down and rebuild from the other dataset; view/layout/tier-filter state and the
  // three toolbars live out here and persist across view switches.
  const DATA = JSON.parse(document.getElementById("graphdata").textContent);
  const TIERS = window.__TIERS__;
  const TIER_RANK = window.__TIER_RANK__;
  const svg = d3.select("#depgraph"), el = svg.node();
  let W = el.clientWidth || 900, H = 820;
  svg.attr("viewBox", [0, 0, W, H]);
  const tip = d3.select("#g-tip");
  const VIEWS = [["package", "Packages"], ["circle", "Subpackage circles"]].filter(([k]) => DATA[k]);
  // focusPkg zooms the circle view down to one package's own circles (set by
  // clicking a package node, or a circle in the all-circles view; cleared by the
  // focus chip or either view button).
  let view = "package", mode = "layered", focusPkg = null;
  const active = new Set(Object.keys(TIERS));
  let sim = null, setLayout = () => {}, applyFilter = () => {};
  const zoom = d3.zoom().scaleExtent([0.3, 4]);
  svg.call(zoom);
  function drag() {
    return d3.drag()
      .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
  }
  function build(viewKey) {
    view = viewKey;
    if (sim) sim.stop();
    svg.selectAll("*").remove();
    svg.call(zoom.transform, d3.zoomIdentity);
    tip.classed("hidden", true);
    d3.selectAll(".view-btn").style("opacity", function () { return this.dataset.view === viewKey ? 1 : 0.4; })
      .style("font-weight", function () { return this.dataset.view === viewKey ? 600 : 400; });
    d3.select("#focus-chip").style("display", viewKey === "circle" && focusPkg ? null : "none")
      .text(focusPkg ? "✕ " + focusPkg : "");
    let NODES = DATA[viewKey].nodes, LINKS = DATA[viewKey].links;
    if (viewKey === "circle" && focusPkg) {
      // zoomed: only this package's circles, and only the edges between them
      // (links may hold string ids or node refs depending on prior builds)
      NODES = NODES.filter((n) => n.packageName === focusPkg);
      const keep = new Set(NODES.map((n) => n.id));
      LINKS = LINKS.filter((l) => keep.has(l.source.id || l.source) && keep.has(l.target.id || l.target));
    }
    // ~4× the nodes need more vertical room for the tier lanes to stay readable;
    // a single package's circles fit the standard viewport
    H = viewKey === "circle" && !focusPkg ? 1600 : 820;
    svg.attr("viewBox", [0, 0, W, H]).style("height", H + "px");
    const maxLoc = d3.max(NODES, (d) => d.loc);
    const r = d3.scaleSqrt().domain([0, maxLoc]).range([0, 50]); // area ∝ loc
    NODES.forEach((n) => (n.r = Math.max(4, r(n.loc))));
    // layered ranks: longest dependency path, cycle edges excluded so it's a DAG
    const parents = new Map(NODES.map((n) => [n.id, []]));
    LINKS.forEach((l) => {
      if (!l.cycle) {
        const s = l.source.id || l.source, t = l.target.id || l.target;
        parents.get(t).push(s);
      }
    });
    const memo = new Map();
    function depthOf(id) {
      if (memo.has(id)) return memo.get(id);
      memo.set(id, 0);
      let d = 0;
      for (const p of parents.get(id)) d = Math.max(d, depthOf(p) + 1);
      memo.set(id, d);
      return d;
    }
    NODES.forEach((n) => (n.depth = depthOf(n.id)));
    const maxDepth = d3.max(NODES, (d) => d.depth) || 1;
    // top-to-bottom: top-level consumers (depth 0, nothing depends on them) sit at the top,
    // foundational neutral infra (max depth, everything chains down to it) at the bottom —
    // so a normal consumer→provider edge points DOWN and a cycle back-edge points UP.
    const layerY = (d) => 50 + (d.depth / maxDepth) * (H - 100);
    NODES.forEach((n) => { n.y = layerY(n); n.x = W / 2 + (Math.random() - 0.5) * W * 0.6; });
    // tier clustering stacked in DAG order: order tiers by mean dependency depth
    // (consumers shallow → top band, neutral infra deep → bottom band) and give each
    // tier a horizontal swimlane, so same-tier nodes cluster and clusters broadly stack.
    const tierDepthSum = new Map(), tierCount = new Map();
    NODES.forEach((n) => {
      tierDepthSum.set(n.tier, (tierDepthSum.get(n.tier) || 0) + n.depth);
      tierCount.set(n.tier, (tierCount.get(n.tier) || 0) + 1);
    });
    const meanDepth = (t) => tierDepthSum.get(t) / tierCount.get(t);
    // Canonical architectural stacking (consumers → foundation): consumers and tools at
    // the top, the SDK and gateway backends in the middle, neutral infra at the bottom.
    // Tiers absent from this list fall back to mean-depth ordering.
    const rankOf = (t) => { const i = TIER_RANK.indexOf(t); return i === -1 ? 100 + meanDepth(t) : i; };
    const presentTiers = [...tierCount.keys()].sort((a, b) => rankOf(a) - rankOf(b) || meanDepth(a) - meanDepth(b));
    const tierBand = new Map(presentTiers.map((t, i) => [t, i]));
    const nBands = Math.max(1, presentTiers.length);
    const bandSpan = () => (H - 120) / nBands;
    const bandY = (tier) => 60 + (tierBand.get(tier) + 0.5) * bandSpan();
    // clustered layout, circle view: give each package its own x slot inside the
    // tier band so a package's circles huddle together instead of interleaving.
    // Stored as a fraction so resize (which changes W) keeps working.
    const slotFrac = new Map();
    if (viewKey === "circle") {
      presentTiers.forEach((t) => {
        const members = NODES.filter((n) => n.tier === t);
        const pkgs = [...new Set(members.map((n) => n.packageName))].sort();
        members.forEach((n) => slotFrac.set(n.id, (pkgs.indexOf(n.packageName) + 0.5) / pkgs.length));
      });
    }
    const clusterX = (d) => slotFrac.has(d.id) ? 80 + (W - 160) * slotFrac.get(d.id) : W / 2;
    const defs = svg.append("defs");
    [["arrow", "#94a3b8"], ["arrow-cy", "#dc2626"]].forEach(([id, col]) => {
      defs.append("marker").attr("id", id).attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", col);
    });
    const rootG = svg.append("g");
    zoom.on("zoom", (e) => rootG.attr("transform", e.transform));
    // faint tier-lane backgrounds, shown only in the clustered layout
    const bandRectG = rootG.append("g").attr("pointer-events", "none").style("display", "none");
    const bandRects = bandRectG.selectAll("rect").data(presentTiers).join("rect")
      .attr("fill", (t) => TIERS[t].fill).attr("fill-opacity", 0.22).attr("rx", 8);
    const linkSel = rootG.append("g").attr("fill", "none").selectAll("line").data(LINKS).join("line")
      .attr("stroke", (d) => d.cycle ? "#dc2626" : "#cbd5e1").attr("stroke-width", (d) => d.cycle ? 2.4 : 1)
      .attr("marker-end", (d) => d.cycle ? "url(#arrow-cy)" : "url(#arrow)");
    const nodeG = rootG.append("g").selectAll("g").data(NODES).join("g").style("cursor", "pointer").call(drag());
    // package view: fill = tier color; circle view: tier hue shaded per package
    // (both baked into node data at assembly time, so nothing branches here).
    // Package-root circles get a heavier ring so the package anchor stands out.
    nodeG.append("circle").attr("r", (d) => d.r).attr("fill", (d) => d.fill).attr("stroke", (d) => d.stroke)
      .attr("stroke-width", (d) => d.isRoot ? 2.6 : 1.4);
    nodeG.append("text").text((d) => d.label).attr("text-anchor", "middle").attr("dy", (d) => d.r + 11)
      .attr("font-size", (d) => Math.max(9, Math.min(13, 8 + d.r / 6))).attr("fill", "#334155")
      .attr("paint-order", "stroke").attr("stroke", "#f8fafc").attr("stroke-width", 3);
    // per-tier cluster captions, shown only in the clustered layout
    const clusterLabels = rootG.append("g").attr("pointer-events", "none").style("display", "none");
    const clusterText = clusterLabels.selectAll("text").data(presentTiers).join("text")
      .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 700)
      .attr("fill", (t) => TIERS[t].stroke).attr("paint-order", "stroke").attr("stroke", "#f8fafc").attr("stroke-width", 4)
      .style("text-transform", "uppercase").style("letter-spacing", "0.08em").text((t) => TIERS[t].name);
    sim = d3.forceSimulation(NODES).on("tick", tick);
    function tick() {
      linkSel.each(function (d) {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
        d.x1 = d.source.x + ux * d.source.r; d.y1 = d.source.y + uy * d.source.r;
        d.x2 = d.target.x - ux * (d.target.r + 5); d.y2 = d.target.y - uy * (d.target.r + 5);
      });
      linkSel.attr("x1", (d) => d.x1).attr("y1", (d) => d.y1).attr("x2", (d) => d.x2).attr("y2", (d) => d.y2);
      nodeG.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }
    setLayout = function (m) {
      mode = m;
      d3.selectAll(".layout-btn").style("opacity", function () { return this.dataset.mode === m ? 1 : 0.4; })
        .style("font-weight", function () { return this.dataset.mode === m ? 600 : 400; });
      sim.force("link", d3.forceLink(LINKS).id((d) => d.id)
        .distance((d) => m === "force" ? (r(d.source.loc) + r(d.target.loc) + 46) : (m === "clustered" ? 46 : 70))
        .strength(m === "clustered" ? 0.02 : (m === "layered" ? 0.05 : 0.35)))
        .force("collide", d3.forceCollide().radius((d) => d.r + 7).strength(0.92));
      if (m === "layered") sim.force("charge", d3.forceManyBody().strength((d) => -90 - d.r * 5))
        .force("x", d3.forceX(W / 2).strength(0.05)).force("y", d3.forceY((d) => layerY(d)).strength(1.0));
      else if (m === "clustered") sim.force("charge", d3.forceManyBody().strength((d) => -70 - d.r * 4))
        .force("x", d3.forceX((d) => clusterX(d)).strength(viewKey === "circle" ? 0.3 : 0.12))
        .force("y", d3.forceY((d) => bandY(d.tier)).strength(0.94));
      else sim.force("charge", d3.forceManyBody().strength((d) => -170 - d.r * 9))
        .force("x", d3.forceX(W / 2).strength(0.05)).force("y", d3.forceY(H / 2).strength(0.07));
      clusterLabels.style("display", m === "clustered" ? null : "none");
      bandRectG.style("display", m === "clustered" ? null : "none");
      if (m === "clustered") {
        clusterText.attr("x", W / 2).attr("y", (t) => Math.max(16, bandY(t) - bandSpan() * 0.5 + 13));
        bandRects.attr("x", 8).attr("width", Math.max(0, W - 16))
          .attr("y", (t) => bandY(t) - bandSpan() * 0.5 + 4).attr("height", Math.max(0, bandSpan() - 8));
      }
      sim.alpha(0.9).restart();
    };
    const nbr = new Map(NODES.map((n) => [n.id, new Set([n.id])]));
    LINKS.forEach((l) => { const s = l.source.id || l.source, t = l.target.id || l.target; nbr.get(s).add(t); nbr.get(t).add(s); });
    const vis = (d) => active.has(d.tier), lvis = (l) => active.has(l.source.tier) && active.has(l.target.tier);
    const tipHtml = (d) => {
      const sub = d.subpackageCount > 0 ? ` · ${d.subpackageCount} subpackage${d.subpackageCount === 1 ? "" : "s"}` : "";
      const who = viewKey === "package"
        ? `<div class="text-slate-300">tier ${TIERS[d.tier].name}${sub}</div>`
        : `<div class="text-slate-300">package <span class="font-mono">${d.packageName}</span> · tier ${TIERS[d.tier].name}</div>`;
      const zoomHint = zoomTarget(d)
        ? `<div class="text-slate-400 mt-1 italic">click to zoom into ${viewKey === "package" ? `${d.subpackageCount + 1} circles` : `<span class="font-mono">${d.packageName}</span>`}</div>`
        : "";
      return `<div class="font-semibold">${d.id}</div>${who}<div class="text-slate-300"><span class="font-mono">${d.loc.toLocaleString()}</span> LOC · rank ${d.depth}</div><div class="text-slate-400 mt-1">fan-out ${d.fanOut} → · fan-in ← ${d.fanIn}</div>${zoomHint}`;
    };
    // zoom targets: a package node with subpackages, or (in the all-circles
    // view) any circle — clicking isolates its enclosing package's circles.
    const zoomTarget = (d) => DATA.circle
      && (viewKey === "package" ? d.subpackageCount > 0 : !focusPkg);
    nodeG.on("click", (e, d) => {
      if (e.defaultPrevented || !zoomTarget(d)) return; // drags suppress clicks
      focusPkg = viewKey === "package" ? d.id : d.packageName;
      build("circle");
    });
    nodeG.on("mouseover", (e, d) => {
      const near = nbr.get(d.id);
      nodeG.style("opacity", (n) => vis(n) ? (near.has(n.id) ? 1 : 0.12) : 0);
      linkSel.style("opacity", (l) => lvis(l) && (l.source.id === d.id || l.target.id === d.id) ? 1 : (lvis(l) ? 0.05 : 0))
        .attr("stroke", (l) => (l.source.id === d.id || l.target.id === d.id) ? (l.cycle ? "#dc2626" : "#475569") : (l.cycle ? "#dc2626" : "#cbd5e1"))
        .attr("stroke-width", (l) => (l.source.id === d.id || l.target.id === d.id) ? (l.cycle ? 2.6 : 1.8) : (l.cycle ? 2.4 : 1));
      tip.html(tipHtml(d)).classed("hidden", false);
    })
      .on("mousemove", (e) => { const b = el.getBoundingClientRect(); tip.style("left", (e.clientX - b.left + 14) + "px").style("top", (e.clientY - b.top + 10) + "px"); })
      .on("mouseout", () => { tip.classed("hidden", true); applyFilter(); });
    applyFilter = function () {
      nodeG.style("opacity", (d) => vis(d) ? 1 : 0.06).style("pointer-events", (d) => vis(d) ? "all" : "none");
      linkSel.style("opacity", (l) => lvis(l) ? (l.cycle ? 0.95 : 0.5) : 0.02).attr("stroke", (l) => l.cycle ? "#dc2626" : "#cbd5e1").attr("stroke-width", (l) => l.cycle ? 2.4 : 1);
    };
    setLayout(mode);
    applyFilter();
  }
  if (VIEWS.length > 1) {
    const vt = d3.select("#view-toolbar");
    vt.append("span").attr("class", "uppercase tracking-wider text-slate-400 mr-1").text("view:");
    VIEWS.forEach(([k, lab]) =>
      vt.append("button").attr("class", "view-btn rounded-full border border-slate-300 px-2.5 py-0.5").attr("data-view", k).text(lab)
        .on("click", () => { if (k !== view || focusPkg) { focusPkg = null; build(k); } }));
    // shows the zoomed-in package while focused; click to widen back to all circles
    vt.append("button").attr("id", "focus-chip")
      .attr("class", "rounded-full border border-slate-400 bg-slate-100 px-2.5 py-0.5 font-mono")
      .attr("title", "clear package zoom").style("display", "none")
      .on("click", () => { focusPkg = null; build("circle"); });
  }
  const lt = d3.select("#layout-toolbar");
  lt.append("span").attr("class", "uppercase tracking-wider text-slate-400 mr-1").text("layout:");
  [["layered", "Layered (DAG)"], ["clustered", "Clustered (tiers)"], ["force", "Force"]].forEach(([m, lab]) =>
    lt.append("button").attr("class", "layout-btn rounded-full border border-slate-300 px-2.5 py-0.5").attr("data-mode", m).text(lab).on("click", () => setLayout(m)));
  const tb = d3.select("#tier-toolbar");
  tb.append("span").attr("class", "uppercase tracking-wider text-slate-400 mr-1").text("tiers:");
  Object.entries(TIERS).forEach(([k, v]) => {
    const b = tb.append("button").attr("data-tier", k).attr("class", "inline-flex items-center gap-1 rounded-full border px-2 py-0.5").style("border-color", v.stroke);
    b.append("span").style("width", "9px").style("height", "9px").style("border-radius", "2px").style("background", v.fill).style("border", "1px solid " + v.stroke);
    b.append("span").text(v.name);
    b.on("click", function () { active.has(k) ? active.delete(k) : active.add(k); d3.select(this).style("opacity", active.has(k) ? 1 : 0.35); applyFilter(); });
  });
  window.addEventListener("resize", () => { W = el.clientWidth || W; svg.attr("viewBox", [0, 0, W, H]); setLayout(mode); });
  build("package");
}

// ── 5. section renderers (editorial markup; content comes from the spec) ─────
function legendSwatch(t) {
  const v = TIERS[t];
  const dash = "border:1px solid " + v.stroke;
  return `<span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm" style="background:${v.fill};${dash}"></span>${esc(v.name)}</span>`;
}

function renderHeader(s, analysis) {
  return html`
  <header class="space-y-5">
    <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Architecture topology scorecard</p>
    <h1 class="text-4xl font-semibold leading-tight">${esc(s.repo)} topology graph<br/><span class="text-slate-500 text-2xl">measured against ${esc(s.targetName)}</span></h1>
    <p class="text-slate-600 max-w-3xl leading-relaxed">${s.intro}</p>
    <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
      <span><span class="font-semibold text-slate-700">${analysis.meta.packageCount}</span> packages</span>
      <span><span class="font-semibold text-slate-700">${analysis.meta.topologyCircleCount ?? analysis.meta.packageCount}</span> topology circles</span>
      <span>package edges = runtime manifests; circle edges = static TypeScript imports/exports</span>
      <span>generated ${esc(s.date)}</span>
    </div>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 border-t border-slate-200 pt-4">
      <span class="uppercase tracking-wider text-slate-400">legend</span>
      ${Object.keys(TIERS).map(legendSwatch).join("\n      ")}
      <span class="inline-flex items-center gap-1.5"><span class="inline-block w-5 h-0.5" style="background:#dc2626"></span>cycle edge</span>
      <span class="inline-flex items-center gap-1.5 text-slate-400">node area ∝ LOC</span>
      <span class="inline-flex items-center gap-1.5 text-slate-400">package view: fill = tier · circle view: tier hue, shaded per package</span>
    </div>
  </header>`;
}

function renderVerdict(s) {
  const cards = s.verdict.stats.map((st) => html`
        <div class="rounded-xl border ${HEALTH[st.health]} p-5">
          <div class="text-3xl font-semibold chip">${esc(st.value)}${st.total ? html` <span class="text-lg text-slate-400">/ ${esc(st.total)}</span>` : ""}</div>
          <div class="text-sm text-slate-600 mt-1">${esc(st.label)}<br/><span class="text-xs text-slate-400">${st.sub}</span></div>
        </div>`).join("");
  return html`
  <section id="verdict" class="space-y-5">
    <h2 class="text-2xl font-semibold">Verdict</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">${cards}
    </div>
    <div class="rounded-lg border-l-4 ${s.verdict.drift ? "border-red-400" : "border-emerald-400"} bg-white p-5 text-slate-700 leading-relaxed max-w-3xl">
      <p class="font-semibold ${s.verdict.drift ? "text-red-700" : "text-emerald-700"} mb-1">${s.verdict.headline}</p>
      ${s.verdict.read}
    </div>
  </section>`;
}

function renderNorthStar(s) {
  const bands = s.northStar.bands.map((b) => {
    const chips = b.packages.map((p) =>
      `<span class="font-mono text-xs bg-white/90 rounded px-2 py-1" style="border:1px ${p.dashed ? "dashed" : "solid"} ${b.chipBorder || "#cbd5e1"}">${esc(p.name || p)}</span>`
    ).join("");
    return html`
      <div class="flex items-stretch" style="background:${b.bg}">
        <div class="tier-label text-[10px] uppercase tracking-widest px-2 py-3 flex items-center text-white" style="background:${b.labelBg}">${esc(b.label)}</div>
        <div class="p-4 flex-1"><div class="flex flex-wrap gap-1.5 items-center">${chips}<span class="text-xs ml-1" style="color:${b.noteColor || "#475569"}">${b.note || ""}</span></div></div>
      </div>`;
  }).join("");
  return html`
  <section id="north-star" class="space-y-4">
    <h2 class="text-2xl font-semibold">The target model</h2>
    <p class="text-slate-600 max-w-3xl">${s.northStar.rule}</p>
    <div class="rounded-xl overflow-hidden border border-slate-200 divide-y divide-slate-200">${bands}
    </div>
    ${s.northStar.offAxis ? `<p class="text-xs text-slate-500 max-w-3xl">${s.northStar.offAxis}</p>` : ""}
  </section>`;
}

function renderGraphSection(s, graphData) {
  return html`
  <section id="actual-graph" class="space-y-4">
    <h2 class="text-2xl font-semibold">The graph as it stands</h2>
    <p class="text-slate-600 max-w-3xl">${s.graphIntro || "The package dependency graph, live — every runtime edge between workspace packages, nodes colored by tier. Toggle the view to <em>subpackage circles</em> to drill into source components (static TypeScript import edges; nodes keep their tier's hue, shaded per enclosing package, with a heavier ring on each package-root circle), or <strong>click a package</strong> to zoom into just that package's internal circle graph — the chip in the toolbar clears the zoom. Node <strong>area ∝ LOC</strong>; tier lanes and filters remain architectural layer semantics. In the layered view a <span class=\"text-red-600 font-medium\">red edge points upward</span> — that is the cycle violation. Drag to pin, scroll to zoom, hover to trace, toggle tiers."}</p>
    <script type="application/json" id="graphdata">${JSON.stringify(graphData)}</script>
    <div class="flex flex-wrap items-center gap-3 mb-2">
      <div id="view-toolbar" class="flex items-center gap-1 text-xs"></div>
      <div id="layout-toolbar" class="flex items-center gap-1 text-xs"></div>
      <div id="tier-toolbar" class="flex flex-wrap items-center gap-2 text-xs"></div>
    </div>
    <div class="relative rounded-lg border border-slate-200 bg-white">
      <svg id="depgraph" class="w-full" style="height:820px; display:block; cursor:grab;"></svg>
      <div id="g-tip" class="pointer-events-none absolute hidden rounded-md bg-slate-900/95 text-slate-100 text-xs px-3 py-2 shadow-lg leading-relaxed" style="max-width:260px"></div>
      <div class="absolute bottom-3 right-3 flex items-end gap-3 text-[10px] text-slate-400 bg-white/80 rounded px-3 py-2">
        <span class="uppercase tracking-wider">area ∝ LOC</span>
        <svg width="92" height="46"><circle cx="14" cy="34" r="6" fill="none" stroke="#94a3b8"/><circle cx="42" cy="28" r="12" fill="none" stroke="#94a3b8"/><circle cx="76" cy="22" r="22" fill="none" stroke="#94a3b8"/></svg>
      </div>
    </div>
    ${s.graphCaption ? `<p class="text-xs text-slate-500 max-w-3xl leading-relaxed">${s.graphCaption}</p>` : ""}
  </section>`;
}

function renderScorecard(s) {
  const rows = s.scorecard.map((r) => html`
              <tr class="align-top">
                <td class="px-4 py-4 font-medium">${r.invariant}</td>
                <td class="px-4 py-4"><span class="inline-block rounded-full ${STATUS_KIND[r.statusKind]} text-xs font-semibold px-2.5 py-1">${esc(r.status)}</span></td>
                <td class="px-4 py-4 text-slate-600">${r.evidence}</td>
              </tr>`).join("");
  return html`
  <section id="scorecard" class="space-y-4">
    <h2 class="text-2xl font-semibold">Scorecard</h2>
    ${s.scorecardIntro ? `<p class="text-slate-600 max-w-3xl">${s.scorecardIntro}</p>` : ""}
    <div class="overflow-hidden rounded-xl border border-slate-200">
      <table class="w-full text-sm">
        <thead class="bg-slate-100 text-slate-500 text-xs uppercase tracking-wider">
          <tr><th class="text-left font-medium px-4 py-3 w-[34%]">Invariant</th><th class="text-left font-medium px-4 py-3 w-[12%]">Status</th><th class="text-left font-medium px-4 py-3">Evidence</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${rows}
        </tbody>
      </table>
    </div>
  </section>`;
}

function mermaidBlock(title, code, tone) {
  const cls = tone === "now"
    ? "border-red-100 bg-red-50/50"
    : tone === "after"
    ? "border-emerald-100 bg-emerald-50/50"
    : "border-amber-100 bg-amber-50/40";
  const tcls = tone === "now" ? "text-red-500" : tone === "after" ? "text-emerald-600" : "text-amber-600";
  return html`<div class="rounded-lg border ${cls} p-3">
      ${title ? `<p class="text-xs uppercase tracking-wider ${tcls} mb-2">${esc(title)}</p>` : ""}
      <pre class="mermaid">${esc(code)}</pre></div>`;
}

function renderFinding(f) {
  let visual = "";
  if (f.beforeAfter) {
    visual = html`<div class="grid md:grid-cols-2 gap-4 items-start">
        ${mermaidBlock(f.beforeAfter.nowLabel || "now", f.beforeAfter.now, "now")}
        ${mermaidBlock(f.beforeAfter.afterLabel || "after", f.beforeAfter.after, "after")}
      </div>`;
  } else if (f.fanin) {
    visual = mermaidBlock(null, f.fanin, "pen");
  }
  let chips = "";
  if (f.chipRows) {
    chips = f.chipRows.map((row) => {
      const items = row.items.map((it) => {
        const cls = it.state === "done"
          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
          : it.state === "pending"
          ? "bg-slate-100 border-slate-300 text-slate-600"
          : "bg-white border-slate-300 text-slate-600";
        return `<span class="font-mono border rounded px-2 py-1 ${cls}">${esc(it.text)}</span>`;
      }).join(" ");
      return `<div class="flex flex-wrap gap-1.5 items-center text-xs"><span class="text-slate-500 mr-1">${esc(row.label)}</span>${items}</div>`;
    }).join("\n          ");
  }
  const wins = (f.wins || []).map((w) => `<li>${esc(w)}</li>`).join("");
  return html`
        <article class="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold">${f.title}</h3>
            <span class="rounded-full ${STRENGTH[f.strength]} text-xs font-semibold px-2 py-0.5">${esc(f.strength)}</span>
            ${f.tag ? `<span class="rounded-full bg-slate-100 text-slate-500 text-xs px-2 py-0.5">${esc(f.tag)}</span>` : ""}
          </div>
          ${visual}
          ${chips}
          <p class="text-slate-700"><span class="font-semibold">Problem.</span> ${f.problem}</p>
          <p class="text-slate-700"><span class="font-semibold">Solution.</span> ${f.solution}</p>
          ${wins ? `<ul class="text-sm text-slate-600 grid grid-cols-2 gap-x-6 gap-y-1 list-disc list-inside">${wins}</ul>` : ""}
          ${f.debtNote ? `<div class="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-800">${f.debtNote}</div>` : ""}
        </article>`;
}

function renderFindings(s) {
  return html`
  <section id="findings" class="space-y-6">
    <h2 class="text-2xl font-semibold">Findings</h2>
    ${s.findings.map(renderFinding).join("\n")}
  </section>`;
}

function renderKeystone(s) {
  const k = s.keystone;
  const paras = k.paras.map((p) => `<p class="text-slate-300 leading-relaxed max-w-3xl">${p}</p>`).join("\n          ");
  const seq = k.sequence.map((step, i) =>
    (i ? `<span class="text-slate-500">→</span>` : "") +
    `<span class="rounded-full ${i === 0 ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40" : "bg-white/10 text-slate-200 border-white/20"} border px-3 py-1">${step}</span>`
  ).join("\n            ");
  return html`
  <section id="top-recommendation" class="space-y-4">
    <h2 class="text-2xl font-semibold">The keystone move</h2>
    <div class="deep rounded-2xl p-8 text-slate-100 space-y-5">
      <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Do this first</p>
      <h3 class="text-2xl font-semibold text-white">${k.title}</h3>
      ${paras}
      <div class="flex flex-wrap items-center gap-2 text-sm pt-2">
            ${seq}
      </div>
    </div>
    ${s.provenance ? `<p class="text-xs text-slate-400">${s.provenance}</p>` : ""}
  </section>`;
}

// ── 6. assemble the page ────────────────────────────────────────────────────
function renderHtml(s, analysis, graphData) {
  const rendererJs = `window.__TIERS__=${JSON.stringify(TIERS)};\nwindow.__TIER_RANK__=${JSON.stringify(TIER_RANK)};\n(${GRAPH_RENDERER.toString()})();`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Package topology — ${esc(s.repo)} vs. ${esc(s.targetName)}</title>
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
      h1,h2,h3 { font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans antialiased">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-16">
${renderHeader(s, analysis)}
${renderVerdict(s)}
${renderNorthStar(s)}
${renderGraphSection(s, graphData)}
${renderScorecard(s)}
${renderFindings(s)}
${renderKeystone(s)}
    </main>
    <script>${rendererJs}</script>
  </body>
</html>`;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const analysis = getAnalysis(args);

  if (args.includes("--tiers-template")) {
    process.stdout.write(JSON.stringify(tiersTemplate(analysis), null, 2) + "\n");
    return;
  }

  // The spec is the only IRREDUCIBLE editorial input. When the caller supplies one
  // (target-scorecard mode), load it. When they don't, synthesize a complete raw
  // topology-inventory spec deterministically from the graph — no agent in the loop,
  // so `build-report.mjs --open` renders a full report on its own.
  const si = args.indexOf("--spec");
  let spec;
  if (si === -1) {
    const ri = args.indexOf("--repo");
    spec = synthesizeSpec(analysis, {
      repo: ri !== -1 ? args[ri + 1] : basename(process.cwd()),
    });
  } else {
    const specPath = resolve(args[si + 1]);
    spec = specPath.endsWith(".json")
      ? JSON.parse(readFileSync(specPath, "utf8"))
      : (await import(pathToFileURL(specPath).href)).default;
  }

  const tierOverrides = spec.tiers || {};
  validateTierOverrides(tierOverrides);
  const packageView = assemblePackageGraph(analysis, tierOverrides);
  // Older graph JSONs lack circle facts; they render the package view only
  // (the report omits the granularity toggle when `circle` is null).
  const circleView = analysis.topologyCircles ? assembleCircleGraph(analysis, tierOverrides) : null;
  const graphData = { package: packageView.graph, circle: circleView?.graph ?? null };
  const warnings = [...new Set([...packageView.warnings, ...(circleView?.warnings ?? [])])];
  if (warnings.length) {
    console.error(`warning: ${warnings.length} package(s)/circle(s) had no known declared/overridden tier (defaulted to "${FALLBACK_TIER}"):`);
    console.error("  " + warnings.join(", "));
  }

  const out = join(
    process.env.TMPDIR || tmpdir() || "/tmp",
    `architecture-topology-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.html`,
  );
  writeFileSync(out, renderHtml(spec, analysis, graphData));
  console.log(out);

  if (args.includes("--open")) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try { execFileSync(opener, [out], { stdio: "ignore" }); } catch { /* opening is best-effort */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

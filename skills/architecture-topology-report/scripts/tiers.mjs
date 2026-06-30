// Shared tier registry + naming helpers, the single source of truth for both the
// browser-side D3 renderer (build-report.mjs) and the deterministic spec
// synthesizer (synthesize-spec.mjs). Keep the palette in sync with the workspace
// source of truth:
//   ts/packages/infra/core/test/support/typescript-style-guard/config.ts
//   (`packageTierValues`).

export const TIERS = {
  capability: { fill: "#bbf7d0", stroke: "#10b981", name: "capability" },
  "capability-kit": { fill: "#d9f99d", stroke: "#65a30d", name: "capability kit" },
  "capability-gateway-backend": { fill: "#99f6e4", stroke: "#0d9488", name: "capability gateway backend" },
  sdk: { fill: "#c7d2fe", stroke: "#6366f1", name: "SDK" },
  "neutral-infra": { fill: "#cbd5e1", stroke: "#64748b", name: "neutral infra" },
  host: { fill: "#475569", stroke: "#0f172a", name: "presentation host" },
  "capability-pi": { fill: "#bae6fd", stroke: "#0284c7", name: "capability Pi" },
  "standalone-tool": { fill: "#f1f5f9", stroke: "#94a3b8", name: "standalone tool" },
  "local-pi-tool": { fill: "#e7e5e4", stroke: "#a8a29e", name: "local pi tool" },
};

// Defensive fallback for any tier not in the registry above (should not happen
// once workspace tier enforcement is in effect); renders in the off-axis bucket.
export const FALLBACK_TIER = "standalone-tool";

// Canonical architectural stacking (consumers → foundation), shared with the
// browser-side renderer. Tiers absent here fall back to mean-depth ordering in
// the graph and to end-of-list ordering in the synthesized tier stack.
export const TIER_RANK = [
  "local-pi-tool",
  "standalone-tool",
  "capability-pi",
  "host",
  "capability",
  "capability-kit",
  "capability-gateway-backend",
  "sdk",
  "neutral-infra",
];

// Short display name for a package id (drops the well-known scope prefixes).
export const label = (id) =>
  id.replace(/^@sdl\//, "").replace(/^@local-pi-tools\//, "lpt:").replace(/^sdl-/, "");

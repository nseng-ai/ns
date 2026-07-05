// Adapts the shared style-guard package tier taxonomy for topology-report
// presentation, extraction policy, and renderer ordering.
import {
  allowedPackageTierDebtEdgeEntries,
  packageEdgeKey,
  packageTierDefinitions,
  tierRank,
} from "../../../ts/packages/internal/typescript-style-guard/src/package-tier-taxonomy.ts";

export { packageEdgeKey };

export const PACKAGE_TIER_IDS = packageTierDefinitions.map((tier) => tier.id);
export const PACKAGE_TIER_POLICY = Object.fromEntries(
  packageTierDefinitions.map((tier) => [tier.id, new Set(tier.allowedTargets)]),
);
export const ALLOWED_PACKAGE_TIER_DEBT_EDGES = new Map(allowedPackageTierDebtEdgeEntries);
export const TIERS = Object.fromEntries(
  packageTierDefinitions.map((tier) => [tier.id, { fill: tier.fill, stroke: tier.stroke, name: tier.name }]),
);

// Defensive fallback for any tier not in the registry above (should not happen
// once workspace tier enforcement is in effect); renders in the off-axis bucket.
export const FALLBACK_TIER = "standalone-tool";

// Canonical architectural stacking (consumers → foundation), shared with the
// browser-side renderer. Tiers absent here fall back to mean-depth ordering in
// the graph and to end-of-list ordering in the synthesized tier stack.
export const TIER_RANK = Array.from(tierRank);

// Short display name for a package id (drops the well-known scope prefixes).
export function label(id) {
  if (id === "@internal/pi-tools") return "ipt";
  return id.replace(/^@internal\/pi-tools\//, "ipt:").replace(/^@nseng-ai\//, "");
}

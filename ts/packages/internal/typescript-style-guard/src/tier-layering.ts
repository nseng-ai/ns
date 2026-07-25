import {
	BAN_PACKAGE_TIER_LAYERING,
	allowedPackageTierDebtEdges,
	packageTierAllowedTargets,
	packageTierValues,
	type PackageTier,
} from "./config.ts";
import { packageEdgeKey } from "./package-tier-taxonomy.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { findManifestKeyPosition, type TextPosition } from "./json-diagnostics.ts";
import { isRecord, type PackageMetadata } from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

export function collectPackageTierLayeringViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	allowedDebtEdges: ReadonlyMap<string, string> = allowedPackageTierDebtEdges,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];

	for (const metadata of [...metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (metadata.rawNsTier === undefined) {
			violations.push(buildTierMetadataViolation(metadata, "missing ns.tier"));
			continue;
		}
		if (metadata.nsTier === undefined) {
			violations.push(
				buildTierMetadataViolation(
					metadata,
					`unknown ns.tier ${JSON.stringify(metadata.rawNsTier)}`,
				),
			);
		}
		violations.push(...collectSubpackageTierMetadataViolations(metadata));
	}

	const packageNames = new Set(metadataByName.keys());
	const edges = collectExtensionManifestWorkspaceEdges(metadataByName, packageNames);
	for (const edge of edges) {
		const fromTier = metadataByName.get(edge.from)?.nsTier;
		const toTier = metadataByName.get(edge.to)?.nsTier;
		if (fromTier === undefined || toTier === undefined) continue;
		const violation = tierEdgeViolation(fromTier, toTier);
		if (violation === undefined) continue;
		if (isAllowedPiSubpackagePeerEdge(edge, metadataByName)) continue;
		if (allowedDebtEdges.has(packageEdgeKey(edge.from, edge.to))) continue;
		violations.push({
			rule: BAN_PACKAGE_TIER_LAYERING,
			path: edge.path,
			line: edge.line,
			column: edge.column,
			text: `${edge.from} (${fromTier}) -> ${edge.to} (${toTier}) violates package tier policy ${violation.policy} with ${violation.severity} severity at ${edge.manifestPath}. Allowed tiers: ${packageTierValues.join(", ")}.`,
		});
	}

	return violations;
}

interface TierEdgeViolation {
	readonly severity: "hard" | "debt";
	readonly policy: string;
}

function tierEdgeViolation(
	fromTier: PackageTier,
	toTier: PackageTier,
): TierEdgeViolation | undefined {
	if (packageTierAllowedTargets[fromTier].has(toTier)) return undefined;
	return { severity: "hard", policy: `${fromTier}-must-not-depend-on-${toTier}` };
}

function isAllowedPiSubpackagePeerEdge(
	edge: { readonly from: string; readonly to: string; readonly field: string },
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	if (edge.to !== "@nseng-ai/pi" || edge.field !== "peerDependencies") return false;
	const metadata = metadataByName.get(edge.from);
	if (metadata?.nsTier !== "extension") return false;
	if (!metadata.nsSubpackages.includes("pi")) return false;
	return isOptionalPeer(metadata.manifest.peerDependenciesMeta, "@nseng-ai/pi");
}

function isOptionalPeer(peerDependenciesMeta: unknown, packageName: string): boolean {
	if (!isRecord(peerDependenciesMeta)) return false;
	const entry = peerDependenciesMeta[packageName];
	return isRecord(entry) && entry.optional === true;
}

// Packages are single-tier (ADR 0032): ns.tier governs the package and every
// declared subpackage, so any ns.subpackageTiers declaration is a defect.
function collectSubpackageTierMetadataViolations(metadata: PackageMetadata): SourceRuleViolation[] {
	const nsField = metadata.manifest.ns;
	if (!isRecord(nsField) || nsField.subpackageTiers === undefined) return [];
	return [
		buildManifestPositionViolation(
			metadata,
			findManifestKeyPosition(
				metadata.manifestContent,
				["ns", "subpackageTiers"],
				"subpackageTiers",
			),
			"declares ns.subpackageTiers, but packages are single-tier: every declared subpackage shares ns.tier (ADR 0032). Remove the key; a subpackage that earns a different tier should be extracted into its own package.",
		),
	];
}

function buildTierMetadataViolation(
	metadata: PackageMetadata,
	reason: string,
): SourceRuleViolation {
	return buildManifestPositionViolation(
		metadata,
		findManifestKeyPosition(metadata.manifestContent, ["ns", "tier"], "tier"),
		`${reason}; declare one of: ${packageTierValues.join(", ")}.`,
	);
}

function buildManifestPositionViolation(
	metadata: PackageMetadata,
	position: TextPosition,
	reason: string,
): SourceRuleViolation {
	return {
		rule: BAN_PACKAGE_TIER_LAYERING,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} ${reason}`,
	};
}

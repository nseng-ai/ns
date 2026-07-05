import {
	BAN_PACKAGE_TIER_LAYERING,
	allowedPackageTierDebtEdges,
	packageTierAllowedTargets,
	packageTierValues,
	type PackageTier,
} from "./config.ts";
import { packageEdgeKey } from "./package-tier-taxonomy.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
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
	if (metadata?.nsTier !== "capability") return false;
	if (!metadata.nsSubpackages.includes("pi")) return false;
	return isOptionalPeer(metadata.manifest.peerDependenciesMeta, "@nseng-ai/pi");
}

function isOptionalPeer(peerDependenciesMeta: unknown, packageName: string): boolean {
	if (!isRecord(peerDependenciesMeta)) return false;
	const entry = peerDependenciesMeta[packageName];
	return isRecord(entry) && entry.optional === true;
}

function buildTierMetadataViolation(
	metadata: PackageMetadata,
	reason: string,
): SourceRuleViolation {
	const position = findNsTierPosition(metadata);
	return {
		rule: BAN_PACKAGE_TIER_LAYERING,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} ${reason}; declare one of: ${packageTierValues.join(", ")}.`,
	};
}

function findNsTierPosition(metadata: PackageMetadata): TextPosition {
	const nsOffset = metadata.manifestContent.indexOf('"ns"');
	if (nsOffset >= 0) {
		const tierOffset = metadata.manifestContent.indexOf('"tier"', nsOffset);
		if (tierOffset >= 0) return lineAndColumnForOffset(metadata.manifestContent, tierOffset);
		return lineAndColumnForOffset(metadata.manifestContent, nsOffset);
	}
	const nameOffset = metadata.manifestContent.indexOf(`"${metadata.name}"`);
	return lineAndColumnForOffset(metadata.manifestContent, Math.max(0, nameOffset));
}

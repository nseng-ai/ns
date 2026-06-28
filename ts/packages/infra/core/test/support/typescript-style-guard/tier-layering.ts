import {
	BAN_PACKAGE_TIER_LAYERING,
	allowedPackageTierDebtEdges,
	packageTierAllowedTargets,
	packageTierValues,
	type PackageTier,
} from "./config.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

export function collectPackageTierLayeringViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	allowedDebtEdges: ReadonlyMap<string, string> = allowedPackageTierDebtEdges,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];

	for (const metadata of [...metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (metadata.rawSdlTier === undefined) {
			violations.push(buildTierMetadataViolation(metadata, "missing sdl.tier"));
			continue;
		}
		if (metadata.sdlTier === undefined) {
			violations.push(
				buildTierMetadataViolation(
					metadata,
					`unknown sdl.tier ${JSON.stringify(metadata.rawSdlTier)}`,
				),
			);
		}
	}

	const packageNames = new Set(metadataByName.keys());
	const edges = collectExtensionManifestWorkspaceEdges(metadataByName, packageNames);
	for (const edge of edges) {
		const fromTier = metadataByName.get(edge.from)?.sdlTier;
		const toTier = metadataByName.get(edge.to)?.sdlTier;
		if (fromTier === undefined || toTier === undefined) continue;
		const violation = tierEdgeViolation(fromTier, toTier);
		if (violation === undefined) continue;
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

export function packageEdgeKey(from: string, to: string): string {
	return `${from}\0${to}`;
}

interface TierEdgeViolation {
	readonly severity: "hard" | "debt";
	readonly policy: string;
}

function tierEdgeViolation(
	fromTier: PackageTier,
	toTier: PackageTier,
): TierEdgeViolation | undefined {
	if (toTier === "transitional" && fromTier !== "transitional") {
		return { severity: "debt", policy: "depends-on-transitional" };
	}
	if (packageTierAllowedTargets[fromTier].has(toTier)) return undefined;
	return { severity: "hard", policy: `${fromTier}-must-not-depend-on-${toTier}` };
}

function buildTierMetadataViolation(
	metadata: PackageMetadata,
	reason: string,
): SourceRuleViolation {
	const position = findSdlTierPosition(metadata);
	return {
		rule: BAN_PACKAGE_TIER_LAYERING,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} ${reason}; declare one of: ${packageTierValues.join(", ")}.`,
	};
}

function findSdlTierPosition(metadata: PackageMetadata): TextPosition {
	const sdlOffset = metadata.manifestContent.indexOf('"sdl"');
	if (sdlOffset >= 0) {
		const tierOffset = metadata.manifestContent.indexOf('"tier"', sdlOffset);
		if (tierOffset >= 0) return lineAndColumnForOffset(metadata.manifestContent, tierOffset);
		return lineAndColumnForOffset(metadata.manifestContent, sdlOffset);
	}
	const nameOffset = metadata.manifestContent.indexOf(`"${metadata.name}"`);
	return lineAndColumnForOffset(metadata.manifestContent, Math.max(0, nameOffset));
}

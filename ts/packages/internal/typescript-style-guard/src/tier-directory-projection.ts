import { BAN_TIER_DIRECTORY_PROJECTION } from "./config.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { PackageTierId } from "./package-tier-taxonomy.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const PACKAGES_ROOT = "ts/packages";

interface TierDirectoryTarget {
	/**
	 * "role-dir": the tier projects to a role directory holding one package per child
	 * directory. "exact-dir": the tier's single package lives at the directory itself —
	 * kernel/ and capability-kit/ are top-level single-package homes by design, not role
	 * directories.
	 */
	readonly kind: "role-dir" | "exact-dir";
	readonly dir: string;
}

/**
 * ADR 0033 projection map: a package's declared ns.tier determines its directory. The
 * projection runs tier -> directory only; directories are a guard-enforced view of the
 * canonical ns.tier classification, never an independent classification.
 */
const tierDirectoryProjection = {
	capability: { kind: "role-dir", dir: "capabilities" },
	"capability-kit": { kind: "exact-dir", dir: "capability-kit" },
	sdk: { kind: "exact-dir", dir: "sdk" },
	"neutral-infra": { kind: "role-dir", dir: "infra" },
	host: { kind: "role-dir", dir: "hosts" },
	"standalone-tool": { kind: "role-dir", dir: "tools" },
	"internal-tool": { kind: "role-dir", dir: "internal" },
} as const satisfies Record<PackageTierId, TierDirectoryTarget>;

export function collectTierDirectoryProjectionViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];

	for (const metadata of [...metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		// Missing or unknown tiers are NS_TS_PACKAGE_TIER_LAYERING's problem, not this rule's.
		if (metadata.nsTier === undefined) continue;
		const target = tierDirectoryProjection[metadata.nsTier];
		if (satisfiesProjection(metadata.packageDir, target)) continue;
		violations.push({
			rule: BAN_TIER_DIRECTORY_PROJECTION,
			path: metadata.packageJsonPath,
			line: findTierManifestPosition(metadata).line,
			column: findTierManifestPosition(metadata).column,
			text: `${metadata.name} declares ns.tier ${metadata.nsTier} but lives at ${metadata.packageDir}; tier ${metadata.nsTier} projects to ${expectedLocationDescription(target)}.`,
		});
	}

	return violations;
}

function satisfiesProjection(packageDir: string, target: TierDirectoryTarget): boolean {
	if (target.kind === "exact-dir") {
		return packageDir === `${PACKAGES_ROOT}/${target.dir}`;
	}
	const prefix = `${PACKAGES_ROOT}/${target.dir}/`;
	if (!packageDir.startsWith(prefix)) return false;
	return !packageDir.slice(prefix.length).includes("/");
}

function expectedLocationDescription(target: TierDirectoryTarget): string {
	if (target.kind === "exact-dir")
		return `${PACKAGES_ROOT}/${target.dir} (top-level single package)`;
	return `${PACKAGES_ROOT}/${target.dir}/<package>`;
}

function findTierManifestPosition(metadata: PackageMetadata): TextPosition {
	const tierOffset = metadata.manifestContent.indexOf('"tier"');
	if (tierOffset >= 0) return lineAndColumnForOffset(metadata.manifestContent, tierOffset);
	const nameOffset = metadata.manifestContent.indexOf(`"${metadata.name}"`);
	return lineAndColumnForOffset(metadata.manifestContent, Math.max(0, nameOffset));
}

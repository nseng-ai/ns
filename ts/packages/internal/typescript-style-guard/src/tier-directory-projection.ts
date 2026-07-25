import { BAN_TIER_DIRECTORY_PROJECTION } from "./config.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { PackageTierId } from "./package-tier-taxonomy.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const PACKAGES_ROOT = "ts/packages";

/**
 * ADR 0044 incubation zone: packages under `ts/packages/incubator/<name>` are exempt from
 * tier -> directory projection. Membership is path-derived, so no manifest field declares
 * it and no tier value encodes it.
 */
const INCUBATOR_DIR = "incubator";

interface TierDirectoryTarget {
	/**
	 * "role-dir": the tier projects to a role directory holding one package per child
	 * directory. "exact-dir": the tier's single package lives at the directory itself —
	 * sdk/ and extension-kit/ are top-level single-package homes by design, not role
	 * directories.
	 */
	readonly kind: "role-dir" | "exact-dir";
	readonly dir: string;
}

/**
 * ADR 0033 projection map, as amended by ADR 0044: a package's declared ns.tier determines
 * its directory. The projection runs tier -> directory only; directories are a
 * guard-enforced view of the canonical ns.tier classification, never an independent
 * classification. The one exception is the path-derived incubation zone above, which
 * suspends the projection rather than adding a competing classification.
 *
 * `extension` projects to `extensions/`, which is currently unoccupied: every ns extension
 * incubates under `incubator/`. The entry declares the graduation home without creating the
 * directory (ADR 0044).
 */
const tierDirectoryProjection = {
	extension: { kind: "role-dir", dir: "extensions" },
	"extension-kit": { kind: "exact-dir", dir: "extension-kit" },
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
		// Incubating packages keep their declared tier but are exempt from its directory.
		if (isIncubatorPath(metadata.packageDir)) continue;
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

/**
 * True for `ts/packages/incubator/<package>` and nothing else. Deliberately the same shape
 * as satisfiesProjection's role-dir branch: exactly one segment below the zone directory, so
 * a nested subpackage directory is not silently exempted along with its parent.
 */
function isIncubatorPath(packageDir: string): boolean {
	const prefix = `${PACKAGES_ROOT}/${INCUBATOR_DIR}/`;
	if (!packageDir.startsWith(prefix)) return false;
	return !packageDir.slice(prefix.length).includes("/");
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

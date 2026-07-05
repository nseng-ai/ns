import {
	allowedPackageTierDebtEdgeEntries,
	packageTierDefinitions,
	type PackageTierId,
} from "./package-tier-taxonomy.ts";

export const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
export const skippedDirectoryNames = new Set([
	".git",
	".next",
	".source",
	".turbo",
	".agents",
	"build",
	"coverage",
	"dist",
	"node_modules",
]);

export const BAN_AS_UNKNOWN_AS = "NS_TS_BAN_AS_UNKNOWN_AS";
export const BAN_IMPORT_ALIAS_FOR_FIRST_PARTY = "NS_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY";
export const BAN_EMPTY_INTERFACE_EXTENDS = "NS_TS_BAN_EMPTY_INTERFACE_EXTENDS";
export const BAN_CAPABILITY_PRIVATE_PEER_IMPORT = "NS_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT";
export const BAN_SNAKE_CASE_CLI_MACHINE_VALUE = "NS_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE";
export const BAN_RAW_PRODUCTION_TIMERS = "NS_TS_BAN_RAW_PRODUCTION_TIMERS";
export const BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE =
	"NS_TS_BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE";
export const BAN_EXTENSION_DEPENDENCY_CYCLE = "NS_TS_BAN_EXTENSION_DEPENDENCY_CYCLE";
export const BAN_INTERNAL_SPACE_ADMISSION = "NS_TS_INTERNAL_SPACE_ADMISSION";
export const BAN_PACKAGE_TIER_LAYERING = "NS_TS_PACKAGE_TIER_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_LAYERING = "NS_TS_TOPOLOGY_CIRCLE_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_CYCLE = "NS_TS_TOPOLOGY_CIRCLE_CYCLE";
export const BAN_SUBPACKAGE_DECLARATION_CONFORMANCE = "NS_TS_SUBPACKAGE_DECLARATION_CONFORMANCE";
export const BAN_EXPORTS_SUBPACKAGE_CONFORMANCE = "NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE";
export const ADVISORY_OPTIONAL_UNDEFINED_PROPERTY = "NS_TS_ADVISORY_OPTIONAL_UNDEFINED_PROPERTY";

export const packageTierValues: readonly PackageTierId[] = packageTierDefinitions.map(
	(tier) => tier.id,
);

export type PackageTier = PackageTierId;

export const packageTierSet: ReadonlySet<string> = new Set(packageTierValues);

export const packageTierAllowedTargets: Readonly<Record<PackageTier, ReadonlySet<PackageTier>>> =
	buildPackageTierAllowedTargets();

export const allowedPackageTierDebtEdges = new Map<string, string>(
	allowedPackageTierDebtEdgeEntries,
);

function buildPackageTierAllowedTargets(): Readonly<Record<PackageTier, ReadonlySet<PackageTier>>> {
	const targets = {} as Record<PackageTier, ReadonlySet<PackageTier>>;
	for (const tier of packageTierDefinitions) {
		targets[tier.id] = new Set(tier.allowedTargets);
	}
	return targets;
}

export const capabilityPackageNames = new Set([
	"@ns/aretro",
	"@ns/branch-context",
	"@ns/ccc",
	"@ns/handoff",
	"@ns/objective",
	"@ns/plans",
	"@ns/address",
	"@ns/slot",
	"@ns/flow",
]);

export const neutralPeerPackageNames = new Set([
	"/cli-runtime",
	"@ns/brmem",
	"@ns/clinkr",
	"@ns/capability-kit/cmux",
	"@ns/core",
	"@ns/capability-kit",
	"@ns/core/exec",
	"@ns/capability-kit/git",
	"@ns/capability-kit/github",
	"@ns/capability-kit/graphite",
]);

export const manifestDependencyFields = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

export const extensionGraphPackageNames = new Set([
	...capabilityPackageNames,
	"@ns/pi",
	"@ns/kernel",
	"nscc",
]);

export const deferredExtensionCycleComponents = [];

export interface DeferredTopologyCircleCycle {
	readonly name: string;
	readonly packageName: string;
	readonly circles: ReadonlySet<string>;
	readonly reason: string;
}

export const deferredTopologyCircleCycles: readonly DeferredTopologyCircleCycle[] = [];

export type ManifestDependencyField = (typeof manifestDependencyFields)[number];

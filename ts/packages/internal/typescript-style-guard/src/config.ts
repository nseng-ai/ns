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
export const BAN_SHARED_TEST_MODULE_STATE = "NS_TS_BAN_SHARED_TEST_MODULE_STATE";
export const BAN_SHARED_TEST_FAKE_TIMERS = "NS_TS_BAN_SHARED_TEST_FAKE_TIMERS";
export const BAN_SHARED_TEST_PROCESS_MUTATION = "NS_TS_BAN_SHARED_TEST_PROCESS_MUTATION";
export const BAN_SHARED_TEST_GLOBAL_LISTENERS = "NS_TS_BAN_SHARED_TEST_GLOBAL_LISTENERS";
export const BAN_SHARED_TEST_SINGLETON_STATE = "NS_TS_BAN_SHARED_TEST_SINGLETON_STATE";
export const BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE =
	"NS_TS_BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE";
export const BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT =
	"NS_TS_BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT";
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

export interface ConcreteCapabilityCommandSurface {
	readonly packageName: string;
	readonly cliPrefixes: readonly string[];
	readonly slashPrefixes: readonly string[];
}

export const concreteCapabilityCommandSurfaces = [
	{ packageName: "@nseng-ai/pr-feedback", cliPrefixes: ["address"], slashPrefixes: ["address"] },
	{ packageName: "@nseng-ai/retros", cliPrefixes: ["retro"], slashPrefixes: ["retro"] },
	{
		packageName: "@nseng-ai/branch-context",
		cliPrefixes: ["branch-context"],
		slashPrefixes: ["branch-context"],
	},
	{ packageName: "@nseng-ai/ccc", cliPrefixes: ["ccc"], slashPrefixes: ["ccc"] },
	{ packageName: "@nseng-ai/flow", cliPrefixes: ["flow"], slashPrefixes: ["flow"] },
	{ packageName: "@nseng-ai/handoffs", cliPrefixes: ["handoff"], slashPrefixes: ["handoff"] },
	{ packageName: "@nseng-ai/objectives", cliPrefixes: ["objective"], slashPrefixes: ["objective"] },
	{ packageName: "@nseng-ai/plans", cliPrefixes: ["plans"], slashPrefixes: ["plans", "plan"] },
	{ packageName: "@nseng-ai/slots", cliPrefixes: ["slot"], slashPrefixes: ["slot"] },
] as const satisfies readonly ConcreteCapabilityCommandSurface[];

export const standaloneToolCommandSurfaces = [
	{
		packageName: "@nseng-ai/reviews",
		cliPrefixes: ["reviews", "review"],
		slashPrefixes: ["reviews", "review"],
	},
] as const satisfies readonly ConcreteCapabilityCommandSurface[];

export const capabilityPackageNames: ReadonlySet<string> = new Set(
	concreteCapabilityCommandSurfaces.map((surface) => surface.packageName),
);

export const manifestDependencyFields = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

export const extensionGraphPackageNames = new Set([
	...capabilityPackageNames,
	"@nseng-ai/capability-kit",
	"@nseng-ai/kernel",
	"@nseng-ai/ns",
	"@nseng-ai/pi",
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

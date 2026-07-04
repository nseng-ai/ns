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
export const BAN_EXTENSION_DEPENDENCY_CYCLE = "NS_TS_BAN_EXTENSION_DEPENDENCY_CYCLE";
export const BAN_INTERNAL_SPACE_ADMISSION = "NS_TS_INTERNAL_SPACE_ADMISSION";
export const BAN_PACKAGE_TIER_LAYERING = "NS_TS_PACKAGE_TIER_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_LAYERING = "NS_TS_TOPOLOGY_CIRCLE_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_CYCLE = "NS_TS_TOPOLOGY_CIRCLE_CYCLE";
export const BAN_SUBPACKAGE_DECLARATION_CONFORMANCE = "NS_TS_SUBPACKAGE_DECLARATION_CONFORMANCE";
export const BAN_EXPORTS_SUBPACKAGE_CONFORMANCE = "NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE";
export const ADVISORY_OPTIONAL_UNDEFINED_PROPERTY = "NS_TS_ADVISORY_OPTIONAL_UNDEFINED_PROPERTY";

export const packageTierValues = [
	"capability",
	"capability-kit",
	"sdk",
	"neutral-infra",
	"host",
	"capability-pi",
	"standalone-tool",
	"internal-pi-tool",
	"internal-tool",
] as const;

export type PackageTier = (typeof packageTierValues)[number];

export const packageTierSet = new Set<string>(packageTierValues);

export const packageTierAllowedTargets: Readonly<Record<PackageTier, ReadonlySet<PackageTier>>> = {
	capability: new Set(["capability", "capability-kit", "sdk", "neutral-infra"]),
	"capability-kit": new Set(["sdk", "neutral-infra"]),
	sdk: new Set(["sdk", "neutral-infra"]),
	"neutral-infra": new Set(["neutral-infra"]),
	host: new Set(["capability", "sdk", "capability-kit", "neutral-infra"]),
	"capability-pi": new Set([
		"capability-pi",
		"host",
		"capability",
		"capability-kit",
		"sdk",
		"neutral-infra",
	]),
	"standalone-tool": new Set([
		"standalone-tool",
		"host",
		"capability",
		"capability-kit",
		"sdk",
		"neutral-infra",
	]),
	"internal-pi-tool": new Set(["internal-pi-tool", "host", "neutral-infra"]),
	"internal-tool": new Set(["internal-tool", "neutral-infra"]),
};

export const allowedPackageTierDebtEdges = new Map<string, string>([
	[
		"@ns/kernel\0@ns/slot",
		"SDK-to-capability CLI mount debt: @ns/kernel still mounts Slot directly.",
	],
	[
		"@ns/kernel\0@ns/capability-kit",
		"SDK-to-capability-kit CLI shell-support debt: @ns/kernel still reuses Capability Kit shell wrappers for the sdl shell operation.",
	],
	[
		"@ns/brmem\0@ns/capability-kit",
		"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	],
	[
		"@internal/pi-tools\0@ns/capability-kit",
		"Internal Pi tools container still reuses Capability Kit GitHub identity and text-repair helpers; resolve when internal-pi-tool helper placement is settled.",
	],
]);

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

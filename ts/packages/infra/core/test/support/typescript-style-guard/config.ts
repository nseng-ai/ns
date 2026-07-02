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

export const BAN_AS_UNKNOWN_AS = "SDL_TS_BAN_AS_UNKNOWN_AS";
export const BAN_IMPORT_ALIAS_FOR_FIRST_PARTY = "SDL_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY";
export const BAN_EMPTY_INTERFACE_EXTENDS = "SDL_TS_BAN_EMPTY_INTERFACE_EXTENDS";
export const BAN_CAPABILITY_PRIVATE_PEER_IMPORT = "SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT";
export const BAN_SNAKE_CASE_CLI_MACHINE_VALUE = "SDL_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE";
export const BAN_RAW_PRODUCTION_TIMERS = "SDL_TS_BAN_RAW_PRODUCTION_TIMERS";
export const BAN_EXTENSION_DEPENDENCY_CYCLE = "SDL_TS_BAN_EXTENSION_DEPENDENCY_CYCLE";
export const BAN_LOCAL_SPACE_ADMISSION = "SDL_TS_LOCAL_SPACE_ADMISSION";
export const BAN_PACKAGE_TIER_LAYERING = "SDL_TS_PACKAGE_TIER_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_LAYERING = "SDL_TS_TOPOLOGY_CIRCLE_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_CYCLE = "SDL_TS_TOPOLOGY_CIRCLE_CYCLE";
export const BAN_SUBPACKAGE_DECLARATION_CONFORMANCE = "SDL_TS_SUBPACKAGE_DECLARATION_CONFORMANCE";
export const ADVISORY_OPTIONAL_UNDEFINED_PROPERTY = "SDL_TS_ADVISORY_OPTIONAL_UNDEFINED_PROPERTY";

export const packageTierValues = [
	"capability",
	"capability-kit",
	"sdk",
	"neutral-infra",
	"host",
	"capability-pi",
	"standalone-tool",
	"local-pi-tool",
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
	"local-pi-tool": new Set(["local-pi-tool", "host", "neutral-infra"]),
};

export const allowedPackageTierDebtEdges = new Map<string, string>([
	[
		"@sdl/kernel\0@sdl/slot",
		"SDK-to-capability CLI mount debt: @sdl/kernel still mounts Slot directly.",
	],
	[
		"@sdl/kernel\0@sdl/capability-kit",
		"SDK-to-capability-kit CLI shell-support debt: @sdl/kernel still reuses Capability Kit shell wrappers for the sdl shell operation.",
	],
	[
		"@sdl/brmem\0@sdl/capability-kit",
		"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	],
	[
		"@sdl-local/pi-tools\0@sdl/capability-kit",
		"Local Pi tools container still reuses Capability Kit GitHub identity and text-repair helpers; resolve when local-pi-tool helper placement is settled.",
	],
]);

export const capabilityPackageNames = new Set([
	"@sdl/aretro",
	"@sdl/branch-context",
	"@sdl/ccc",
	"@sdl/handoff",
	"@sdl/objective",
	"@sdl/plans",
	"@sdl/address",
	"@sdl/slot",
	"sdl-flow",
]);

export const neutralPeerPackageNames = new Set([
	"/cli-runtime",
	"@sdl/brmem",
	"@sdl/clinkr",
	"@sdl/capability-kit/cmux",
	"@sdl/core",
	"@sdl/capability-kit",
	"@sdl/core/exec",
	"@sdl/capability-kit/git",
	"@sdl/capability-kit/github",
	"@sdl/capability-kit/graphite",
]);

export const manifestDependencyFields = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

export const extensionGraphPackageNames = new Set([
	...capabilityPackageNames,
	"@sdl/pi",
	"@sdl/kernel",
	"sdlcc",
]);

export const deferredExtensionCycleComponents = [];

export interface DeferredTopologyCircleCycle {
	readonly name: string;
	readonly packageName: string;
	readonly circles: ReadonlySet<string>;
	readonly reason: string;
}

export const deferredTopologyCircleCycles: readonly DeferredTopologyCircleCycle[] = [
	{
		name: "capability-kit-git-kit",
		packageName: "@sdl/capability-kit",
		circles: new Set(["git", "kit"]),
		reason: "root kit exports git while tests consume kit fakes; the fix relocates both edges.",
	},
	{
		name: "kernel-cli-extensions-operations",
		packageName: "@sdl/kernel",
		circles: new Set(["cli", "extensions", "operations"]),
		reason:
			"command-registry and zod issue helpers are misfiled; the fix folds operations into cli.",
	},
	{
		name: "slot-core-lifecycle",
		packageName: "@sdl/slot",
		circles: new Set(["core", "lifecycle"]),
		reason:
			"core command operations currently sit above lifecycle; the fix moves them into lifecycle.",
	},
	{
		name: "flow-api-core-land-submit",
		packageName: "sdl-flow",
		circles: new Set(["api", "core", "land", "submit"]),
		reason:
			"orchestrator logic in api and submit wrappers in core form a cycle; the fix relocates both.",
	},
	{
		name: "pi-host-five-circle",
		packageName: "@sdl/pi",
		circles: new Set(["kit", "commands", "runtime", "parity", "core"]),
		reason:
			"bottom types and parity base are misfiled; the fix moves modules into runtime and parity.",
	},
];

export type ManifestDependencyField = (typeof manifestDependencyFields)[number];

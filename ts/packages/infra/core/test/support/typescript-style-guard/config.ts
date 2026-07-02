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
export const BAN_PACKAGE_TIER_LAYERING = "SDL_TS_PACKAGE_TIER_LAYERING";
export const BAN_TOPOLOGY_CIRCLE_LAYERING = "SDL_TS_TOPOLOGY_CIRCLE_LAYERING";
export const BAN_SUBPACKAGE_DECLARATION_CONFORMANCE = "SDL_TS_SUBPACKAGE_DECLARATION_CONFORMANCE";
export const ADVISORY_OPTIONAL_UNDEFINED_PROPERTY = "SDL_TS_ADVISORY_OPTIONAL_UNDEFINED_PROPERTY";

export const packageTierValues = [
	"capability",
	"capability-kit",
	"capability-gateway-backend",
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
	capability: new Set([
		"capability",
		"capability-kit",
		"capability-gateway-backend",
		"sdk",
		"neutral-infra",
	]),
	"capability-kit": new Set(["capability-gateway-backend", "sdk", "neutral-infra"]),
	"capability-gateway-backend": new Set(["capability-gateway-backend", "neutral-infra"]),
	sdk: new Set(["sdk", "neutral-infra"]),
	"neutral-infra": new Set(["neutral-infra"]),
	host: new Set([
		"capability",
		"sdk",
		"capability-kit",
		"capability-gateway-backend",
		"neutral-infra",
	]),
	"capability-pi": new Set([
		"capability-pi",
		"host",
		"capability",
		"capability-kit",
		"capability-gateway-backend",
		"sdk",
		"neutral-infra",
	]),
	"standalone-tool": new Set([
		"standalone-tool",
		"host",
		"capability",
		"capability-kit",
		"capability-gateway-backend",
		"sdk",
		"neutral-infra",
	]),
	"local-pi-tool": new Set([
		"local-pi-tool",
		"host",
		"capability-gateway-backend",
		"neutral-infra",
	]),
};

export const allowedPackageTierDebtEdges = new Map<string, string>([
	[
		"@sdl/kernel\0@sdl/slot",
		"SDK-to-capability CLI mount debt: @sdl/kernel still mounts Slot directly.",
	],
	[
		"@sdl/brmem\0@sdl/capability-kit",
		"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	],
	[
		"@sdl/brmem\0@sdl/git",
		"Git gateway backend relocation debt: brmem consumes @sdl/git until the separate brmem follow-up retier lands.",
	],
	[
		"@local-pi-tools/thermo-council\0@sdl/capability-kit",
		"Text-repair helper reuse debt: thermo-council reuses the canonical Capability Kit text-repair loop until local-pi-tool tier policy is reconciled with shared helper placement.",
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
	"@sdl/roaster",
	"@sdl/slot",
	"sdl-flow",
]);

export const neutralPeerPackageNames = new Set([
	"/cli-runtime",
	"@sdl/brmem",
	"@sdl/clinkr",
	"@sdl/cmux",
	"@sdl/core",
	"@sdl/capability-kit",
	"@sdl/core/exec",
	"@sdl/git",
	"@sdl/github",
	"@sdl/graphite",
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
	"@sdl/worktree-status",
	"sdlcc",
]);

export const deferredExtensionCycleComponents = [];

export type ManifestDependencyField = (typeof manifestDependencyFields)[number];

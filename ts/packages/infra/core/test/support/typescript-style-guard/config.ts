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
export const BAN_EXTENSION_DEPENDENCY_CYCLE = "SDL_TS_BAN_EXTENSION_DEPENDENCY_CYCLE";
export const BAN_PACKAGE_TIER_LAYERING = "SDL_TS_PACKAGE_TIER_LAYERING";

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
		"@sdl/ccc\0@sdl/pi",
		"CCC clean-consumer debt tracked by the sdl-extension-architecture objective step 5.",
	],
	[
		"@sdl/kernel\0@sdl/slot",
		"SDK-to-capability CLI mount debt: @sdl/kernel still mounts Slot directly.",
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
	"@sdl/brmem",
	"@sdl/clinkr",
	"@sdl/cmux",
	"@sdl/core",
	"@sdl/capability-kit",
	"@sdl/graphite",
]);

export const manifestDependencyFields = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

export const extensionGraphPackageNames = new Set([
	...capabilityPackageNames,
	"@sdl/autobranch",
	"@sdl/pi",
	"@sdl/kernel",
	"@sdl/worktree-status",
	"sdlcc",
]);

export const deferredExtensionCycleComponents = [];

export type ManifestDependencyField = (typeof manifestDependencyFields)[number];

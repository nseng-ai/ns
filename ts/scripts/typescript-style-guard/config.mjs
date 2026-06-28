export const repoRoot = process.cwd();

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

export const capabilityPackageNames = new Set([
  "@sdl/aretro",
  "@sdl/branch-context",
  "@sdl/ccc",
  "@sdl/handoff",
  "@sdl/objective",
  "@sdl/plans",
  "@sdl/pr-address",
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

export const manifestDependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];

export const extensionGraphPackageNames = new Set([
  ...capabilityPackageNames,
  "@sdl/autobranch",
  "@sdl/pi",
  "@sdl/sdl",
  "@sdl/worktree-status",
  "sdlcc",
]);

// Deferred by the objective-capability-extension slice: this known package cycle is real,
// but breaking it belongs to separate graph cleanup work, not this manifest-scoped guard addition.
export const deferredExtensionCycleComponents = [
  {
    name: "legacy-autobranch-pi-sdl-cycle",
    packages: new Set(["@sdl/autobranch", "@sdl/pi", "@sdl/sdl"]),
    reason:
      "Known legacy extension package cycle deferred from the objective-capability-extension stack; do not add packages to this component without separate graph cleanup review.",
  },
];

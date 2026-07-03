// Pure rename data + specifier transform for the package-scope sweep row of
// the rename-sdl-to-ji objective. Consumer artifact: throwaway after cutover,
// no promotion path (see README.md).

export const PACKAGE_NAME_MAP: Readonly<Record<string, string>> = {
	"@sdl/kernel": "@ji/kernel",
	"@sdl/pi": "@ji/pi",
	"@sdl/packagechk": "@ji/packagechk",
	"@sdl/capability-kit": "@ji/capability-kit",
	"@sdl/areg": "@ji/areg",
	"@sdl/slot": "@ji/slot",
	"@sdl/handoff": "@ji/handoff",
	"@sdl/address": "@ji/address",
	"@sdl/vibechk": "@ji/vibechk",
	"@sdl/branch-context": "@ji/branch-context",
	"@sdl/brmem": "@ji/brmem",
	"@sdl/clinkr": "@ji/clinkr",
	"@sdl/roaster": "@ji/roaster",
	"@sdl/plans": "@ji/plans",
	"@sdl/objective": "@ji/objective",
	"@sdl/ccc": "@ji/ccc",
	"@sdl/aretro": "@ji/aretro",
	"@sdl/core": "@ji/core",
	"sdl-flow": "@ji/flow",
	sdlcc: "jicc",
	"@sdl-local/pi-tools": "@internal/pi-tools",
	"sdl-ts-workspace": "ji-ts-workspace",
};

// Dangling dependency key with no backing workspace package; dropped, not renamed.
export const PHANTOM_DEPENDENCY_KEYS: readonly string[] = [
	"@sdl/review-reinvention-scanner",
];

// Path segments renamed inside specifiers, export subpaths, and export values.
// Keys match one whole `/`-separated segment.
const SEGMENT_MAP: Readonly<Record<string, string>> = {
	sdl: "ji",
	"sdl-command": "ji-command",
	"sdl-context": "ji-context",
	"sdl-command.ts": "ji-command.ts",
	"sdl-context.ts": "ji-context.ts",
	"sdl-command.test.ts": "ji-command.test.ts",
	"sdl-context.test.ts": "ji-context.test.ts",
	"repo-local-sdl-extension.ts": "repo-local-ji-extension.ts",
	"sdl-extension.ts": "ji-extension.ts",
	"sdl-extension.test.ts": "ji-extension.test.ts",
	"sdl-runtime.ts": "ji-runtime.ts",
	"sdl-cli-fakes.ts": "ji-cli-fakes.ts",
	"handoff-sdl-command-fakes.ts": "handoff-ji-command-fakes.ts",
	"handoff-sdl-commands.test.ts": "handoff-ji-commands.test.ts",
	"sdl-command-harness.ts": "ji-command-harness.ts",
	"sdl-capability-kit": "capability-kit",
	sdlcc: "jicc",
};

interface SpecifierHead {
	readonly head: string;
	readonly rest: string;
}

function splitHead(specifier: string): SpecifierHead | undefined {
	if (specifier.startsWith("@sdl-local/")) {
		return { head: "@internal/", rest: specifier.slice("@sdl-local/".length) };
	}
	if (specifier.startsWith("@sdl/")) {
		return { head: "@ji/", rest: specifier.slice("@sdl/".length) };
	}
	if (specifier === "sdl-flow" || specifier.startsWith("sdl-flow/")) {
		return { head: "@ji/flow", rest: specifier.slice("sdl-flow".length) };
	}
	if (specifier === "sdlcc" || specifier.startsWith("sdlcc/")) {
		return { head: "jicc", rest: specifier.slice("sdlcc".length) };
	}
	if (specifier.startsWith("./") || specifier.startsWith("../")) {
		return { head: "", rest: specifier };
	}
	return undefined;
}

function mapSegments(path: string): string {
	return path
		.split("/")
		.map((segment) => SEGMENT_MAP[segment] ?? segment)
		.join("/");
}

/**
 * Rename a module specifier (or specifier-shaped string). Returns undefined
 * when the string is not specifier-shaped or nothing changes.
 */
export function renameSpecifier(specifier: string): string | undefined {
	const split = splitHead(specifier);
	if (split === undefined) {
		return undefined;
	}
	const renamed = split.head + mapSegments(split.rest);
	return renamed === specifier ? undefined : renamed;
}

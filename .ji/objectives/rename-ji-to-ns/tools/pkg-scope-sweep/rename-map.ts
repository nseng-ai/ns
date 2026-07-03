// Pure rename data + specifier transform for the package-scope sweep row of
// the rename-ji-to-ns objective (phase 2 / PR-5). Consumer artifact: throwaway
// after cutover, no promotion path (see README.md).
//
// API shape is identical to the rename-sdl-to-ji predecessor so codemod.ts and
// manifest-rewrite.ts consume it unchanged.

export const PACKAGE_NAME_MAP: Readonly<Record<string, string>> = {
	// 20 @ji-scoped workspace packages under ts/packages/* (verified against
	// each package.json `name` on 2026-07-03).
	"@ji/kernel": "@ns/kernel",
	"@ji/pi": "@ns/pi",
	"@ji/packagechk": "@ns/packagechk",
	"@ji/capability-kit": "@ns/capability-kit",
	"@ji/areg": "@ns/areg",
	"@ji/slot": "@ns/slot",
	"@ji/handoff": "@ns/handoff",
	"@ji/address": "@ns/address",
	"@ji/vibechk": "@ns/vibechk",
	"@ji/branch-context": "@ns/branch-context",
	"@ji/brmem": "@ns/brmem",
	"@ji/clinkr": "@ns/clinkr",
	"@ji/roaster": "@ns/roaster",
	"@ji/plans": "@ns/plans",
	"@ji/objective": "@ns/objective",
	"@ji/ccc": "@ns/ccc",
	"@ji/aretro": "@ns/aretro",
	"@ji/core": "@ns/core",
	"@ji/flow": "@ns/flow",
	"@ji/command-backed-skill-registry": "@ns/command-backed-skill-registry",
	// Workspace member living under <consumer>/reviews/*/tools/* (glob in
	// ts/pnpm-workspace.yaml). 21st @ji-scoped package.
	"@ji/review-reinvention-scanner": "@ns/review-reinvention-scanner",
	// Unscoped names.
	jicc: "nscc",
	"ji-ts-workspace": "ns-ts-workspace",
	// Test-fixture scopes. These occur only as inline string literals in
	// ts/packages/infra/core and ts/packages/kernel tests (no fixture
	// package.json carries them); the generic "@ji/" head rule in
	// renameSpecifier covers them, but they are listed here as documented
	// rename data.
	"@ji/example": "@ns/example",
	"@ji/example-pi": "@ns/example-pi",
	"@ji/grill": "@ns/grill",
	// @internal/pi-tools is NOT renamed.
};

// Path segments renamed inside specifiers, export subpaths, and export values.
// Keys match one whole `/`-separated segment.
// File names verified against `git ls-files` on 2026-07-03.
const SEGMENT_MAP: Readonly<Record<string, string>> = {
	// src/ji directory segment (9 capability packages).
	ji: "ns",
	// Extensionless export-subpath keys (@ns/capability-kit + @ns/address).
	"ji-command": "ns-command",
	"ji-context": "ns-context",
	"ji-runtime": "ns-runtime",
	"ji-extension": "ns-extension",
	// ji-named files.
	"ji-command.ts": "ns-command.ts",
	"ji-context.ts": "ns-context.ts",
	"ji-command.test.ts": "ns-command.test.ts",
	"ji-context.test.ts": "ns-context.test.ts",
	"repo-local-ji-extension.ts": "repo-local-ns-extension.ts",
	"ji-extension.ts": "ns-extension.ts",
	"ji-extension.test.ts": "ns-extension.test.ts",
	"ji-runtime.ts": "ns-runtime.ts",
	"ji-cli-fakes.ts": "ns-cli-fakes.ts",
	"handoff-ji-command-fakes.ts": "handoff-ns-command-fakes.ts",
	"handoff-ji-commands.test.ts": "handoff-ns-commands.test.ts",
	"ji-command-harness.ts": "ns-command-harness.ts",
	// jicc package directory segment (e.g. "hosts/jicc" in relative paths).
	jicc: "nscc",
};

interface SpecifierHead {
	readonly head: string;
	readonly rest: string;
}

function splitHead(specifier: string): SpecifierHead | undefined {
	if (specifier.startsWith("@ji/")) {
		return { head: "@ns/", rest: specifier.slice("@ji/".length) };
	}
	if (specifier === "jicc" || specifier.startsWith("jicc/")) {
		return { head: "nscc", rest: specifier.slice("jicc".length) };
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
 *
 * NUL guard: the typescript-style-guard config keys join two package names
 * with "\0" (e.g. "@ji/kernel\0@ji/slot"); a naive prefix rename would only
 * rewrite the first half. Those strings are hand-edit sites (hand-edits.md),
 * so any string containing NUL is rejected here.
 */
export function renameSpecifier(specifier: string): string | undefined {
	if (specifier.includes("\0")) {
		return undefined;
	}
	const split = splitHead(specifier);
	if (split === undefined) {
		return undefined;
	}
	const renamed = split.head + mapSegments(split.rest);
	return renamed === specifier ? undefined : renamed;
}

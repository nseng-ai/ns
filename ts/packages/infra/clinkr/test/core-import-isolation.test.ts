// EARLY CANARY (not the enforcement): the clinkr CORE entrypoint (`@sdl/clinkr`, i.e. src/index.ts)
// must stay free of the heavy display deps `ansis` and `log-update`. Those belong only to the opt-in
// `@sdl/clinkr/theme` and `@sdl/clinkr/stream` subpaths, which are SEPARATE export paths and are NOT
// re-exported from core. Pulling either into the core module graph would silently make every `sdl`
// command pay for them. The formal import-boundary LINT is a later row; this test is the cheap canary
// that fails the moment a core module grows such an import.
//
// It works by statically walking the import graph: starting at src/index.ts it follows every relative
// `.ts` import (resolving them on disk), collecting the transitive core graph, then asserts no reachable
// file imports `ansis`/`log-update`. It deliberately does NOT descend into the `./theme` or `./stream`
// subtrees — core never imports them, and they are allowed to use those deps. A static scan is chosen
// over runtime module-registry inspection because Vitest's ESM isolation makes cache inspection
// unreliable, whereas the source graph is deterministic.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const CORE_ENTRYPOINT = resolve(SRC_DIR, "index.ts");

// The display deps that core must never transitively import (bare specifier or any subpath).
const FORBIDDEN_DEPS = ["ansis", "log-update"];

// Subtrees that are intentionally OUTSIDE the core `.` graph (their own subpath exports). Core never
// imports them; we still refuse to descend in case a future edit wires one in by mistake.
const NON_CORE_SUBTREES = [resolve(SRC_DIR, "theme"), resolve(SRC_DIR, "stream")];

/** Relative module specifiers (`./x.ts`, `../y.ts`) imported or re-exported by a source file. */
function relativeImportsOf(source: string): string[] {
	const specifiers: string[] = [];
	// Matches `import ... from "..."`, `export ... from "..."`, and bare `import "..."`.
	const pattern = /(?:from|import)\s+["'](\.[^"']*)["']/g;
	for (const match of source.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	return specifiers;
}

/** True when `source` imports (or re-exports from) one of the forbidden display deps. */
function importsForbiddenDep(source: string): string | undefined {
	for (const dep of FORBIDDEN_DEPS) {
		const pattern = new RegExp(`(?:from|import)\\s+["']${dep}(?:/[^"']*)?["']`);
		if (pattern.test(source)) return dep;
	}
	return undefined;
}

function isUnderNonCoreSubtree(file: string): boolean {
	return NON_CORE_SUBTREES.some((subtree) => file === subtree || file.startsWith(`${subtree}/`));
}

/** Walk the transitive core graph from `entrypoint`, following relative `.ts` imports only. */
function collectCoreGraph(entrypoint: string): string[] {
	const visited = new Set<string>();
	const queue = [entrypoint];
	while (queue.length > 0) {
		const file = queue.pop();
		if (file === undefined || visited.has(file)) continue;
		visited.add(file);
		const source = readFileSync(file, "utf8");
		for (const specifier of relativeImportsOf(source)) {
			const target = resolve(dirname(file), specifier);
			if (isUnderNonCoreSubtree(target)) continue;
			if (!visited.has(target)) queue.push(target);
		}
	}
	return [...visited];
}

describe("clinkr core import isolation", () => {
	test("no core module transitively imports ansis or log-update", () => {
		const graph = collectCoreGraph(CORE_ENTRYPOINT);
		// Sanity: the walk actually reached more than just the barrel.
		expect(graph.length).toBeGreaterThan(1);

		const offenders = graph
			.map((file) => ({ file, dep: importsForbiddenDep(readFileSync(file, "utf8")) }))
			.filter((entry): entry is { file: string; dep: string } => entry.dep !== undefined);

		expect(offenders).toEqual([]);
	});
});

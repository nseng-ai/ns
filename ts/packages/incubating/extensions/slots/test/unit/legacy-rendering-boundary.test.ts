import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { literalSpecifierUsesOf, sourceFilesUnder } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

const SOURCE_DIRECTORY = resolve(import.meta.dirname, "../../src");
const LEGACY_SPECIFIER = "@nseng-ai/clinkr/legacy";

const EXPECTED_LEGACY_RENDERING_IMPORTS = {
	"core/context.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"core/navigation-presentation.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/checkout.ts": ["RenderCapabilities"],
	"lifecycle/operations/claim.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/destructive-presentation.ts": ["RenderCapabilities"],
	"lifecycle/operations/foreach.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/free.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/gc.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/goto.ts": ["RenderCapabilities"],
	"lifecycle/operations/gt/free-stack.ts": ["RenderCapabilities"],
	"lifecycle/operations/gt/navigation.ts": ["RenderCapabilities"],
	"lifecycle/operations/init.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/list.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/provision/apply.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/provision/import.ts": ["RenderCapabilities", "resolveRenderCapabilities"],
	"lifecycle/operations/resize.ts": ["RenderCapabilities"],
} as const;

describe("Slot legacy Clinkr boundary", () => {
	test("retains only the presentation capabilities used by Slot renderers", () => {
		const imports = Object.fromEntries(
			sourceFilesUnder(SOURCE_DIRECTORY)
				.flatMap((file) => legacyImports(file))
				.map(({ file, symbols }) => [relative(SOURCE_DIRECTORY, file), symbols]),
		);

		expect(imports).toEqual(EXPECTED_LEGACY_RENDERING_IMPORTS);
	});
});

function legacyImports(file: string): readonly { file: string; symbols: readonly string[] }[] {
	const source = readFileSync(file, "utf8");
	const uses = literalSpecifierUsesOf(source).filter(
		({ specifier }) => specifier === LEGACY_SPECIFIER,
	);
	if (uses.length === 0) return [];
	expect(uses, relative(SOURCE_DIRECTORY, file)).toEqual([
		{ specifier: LEGACY_SPECIFIER, kind: "static-import" },
	]);
	const declaration = source.match(
		/import\s+(?:type\s+)?{(?<bindings>[^}]*)}\s*from\s*"@nseng-ai\/clinkr\/legacy";/,
	);
	if (declaration?.groups?.bindings === undefined) {
		throw new Error(`Could not inspect legacy Clinkr import in ${file}`);
	}
	const symbols = declaration.groups.bindings
		.split(",")
		.map((binding) => binding.trim().replace(/^type\s+/, ""))
		.filter((binding) => binding !== "")
		.toSorted();
	return [{ file, symbols }];
}

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { validateDescriptorCommandContribution } from "../../src/extensions/command-registry.ts";
import { loadNsExtensionContribution } from "../../src/extensions/loader.ts";
import type { ExtensionCommandEntry } from "../../src/sdk/descriptor.ts";

const tempDirs: string[] = [];
const sdkCommandEntryPath = fileURLToPath(new URL("../../src/command/index.ts", import.meta.url));

async function createModule(source: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-loader-"));
	tempDirs.push(directory);
	const modulePath = join(directory, "extension.ts");
	mkdirSync(dirname(modulePath), { recursive: true });
	writeFileSync(modulePath, source);
	return modulePath;
}

function entry(kind: ExtensionCommandEntry["kind"], name: string): ExtensionCommandEntry {
	if (kind === "ns-command") {
		return { kind, name, load: () => ({ default: {} as never }) };
	}
	return { kind, name, load: () => ({ default: {} as never }) };
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension loader", () => {
	test("loads and validates a flat ns command while preserving its declared kind", async () => {
		const modulePath = await createModule(`
import { ok, z } from "@nseng-ai/sdk";
import { defineCommand } from ${JSON.stringify(sdkCommandEntryPath)};
export default defineCommand({
	name: "greet",
	summary: "Say hello.",
	resultSchema: z.string(),
	handler() { return ok("hello"); },
});
`);
		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		if (!loaded.ok) throw new Error(loaded.diagnostic.message);
		const validation = validateDescriptorCommandContribution(
			loaded.defaultExport,
			entry("ns-command", "greet"),
			modulePath,
		);
		expect(validation).toMatchObject({
			ok: true,
			loaded: { kind: "ns-command", command: { name: "greet" } },
		});
	});

	test("loads and validates a raw command while preserving its declared kind", async () => {
		const loaded = await loadNsExtensionContribution({
			type: "package",
			specifier: "@nseng-ai/objectives/ns/commands/list",
		});

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(
			validateDescriptorCommandContribution(
				loaded.defaultExport,
				entry("raw-command", "list"),
				"@nseng-ai/objectives/ns/commands/list",
			),
		).toMatchObject({ ok: true, loaded: { kind: "raw-command", command: { name: "list" } } });
	});

	test.each([
		[
			"ns-command",
			`import { ok } from "@nseng-ai/sdk"; export default { name: "probe", summary: "Probe.", description: "Probe.", run() { return ok("raw"); } };`,
			"declared ns-command module",
		],
		[
			"raw-command",
			`import { ok, z } from "@nseng-ai/sdk"; import { defineCommand } from ${JSON.stringify(sdkCommandEntryPath)}; export default defineCommand({ name: "probe", summary: "Probe.", resultSchema: z.string(), handler() { return ok("ns"); } });`,
			"declared raw-command module",
		],
	] as const)(
		"rejects a %s entry whose runtime module has the wrong shape",
		async (kind, source, message) => {
			const modulePath = await createModule(source);
			const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

			if (!loaded.ok) throw new Error(loaded.diagnostic.message);
			expect(
				validateDescriptorCommandContribution(
					loaded.defaultExport,
					entry(kind, "probe"),
					modulePath,
				),
			).toMatchObject({ ok: false, message: expect.stringContaining(message) });
		},
	);

	test("object-shaped commandless default export is rejected by selected-kind validation", async () => {
		const modulePath = await createModule("export default { name: 'greet' };\n");
		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(
			validateDescriptorCommandContribution(
				loaded.defaultExport,
				entry("raw-command", "greet"),
				modulePath,
			),
		).toMatchObject({
			ok: false,
			message: expect.stringContaining("command summary must be a string"),
		});
	});

	test("import failures are structured errors", async () => {
		const modulePath = await createModule("throw new Error('boom');\n");
		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		expect(loaded).toMatchObject({
			ok: false,
			diagnostic: { code: "ns_extension_contribution_import_failed", path: modulePath },
		});
	});
});

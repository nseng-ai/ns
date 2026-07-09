import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateNsExtensionContribution } from "../../src/extensions/command-registry.ts";
import { loadNsExtensionContribution } from "../../src/extensions/loader.ts";
import { parsedSpecForCommand } from "../../src/sdk/command.ts";
import { z } from "@nseng-ai/kernel/sdk";

const tempDirs: string[] = [];

async function createModule(source: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-loader-"));
	tempDirs.push(directory);
	const modulePath = join(directory, "extension.ts");
	mkdirSync(dirname(modulePath), { recursive: true });
	writeFileSync(modulePath, source);
	return modulePath;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension loader", () => {
	test("loads a TypeScript command entry with SDK identity", async () => {
		const modulePath = await createModule(`
import { defineExtension, ok, z } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	commands: [{
	name: "greet",
	summary: "Say hello.",
	description: "Say hello with details.",
	schema: z.object({ loud: z.boolean().default(false) }),
	run(_ctx, request) { return ok(request.loud ? "HELLO" : "hello"); },
}],
});
`);

		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const validation = validateNsExtensionContribution(loaded.defaultExport, "greet", modulePath);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const command = validation.command;
		expect(command.name).toBe("greet");
		expect(parsedSpecForCommand(command)?.schema).toBeInstanceOf(z.ZodObject);
	});

	test("loads package-specifier references through host package resolution", async () => {
		const loaded = await loadNsExtensionContribution({
			type: "package",
			specifier: "@nseng-ai/objectives/ns/commands/list",
		});

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const validation = validateNsExtensionContribution(
			loaded.defaultExport,
			"list",
			"@nseng-ai/objectives/ns/commands/list",
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		expect(validation.command.name).toBe("list");
	});

	test("validates nested-path manifest entries against the loaded command leaf", async () => {
		const modulePath = await createModule(`
import { defineExtension, ok } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	commands: [{
		name: "list",
		summary: "List things.",
		description: "List things with details.",
		run() { return ok({}); },
	}],
});
`);

		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const validation = validateNsExtensionContribution(
			loaded.defaultExport,
			{ name: "review-list", segments: ["reviews", "review", "list"] },
			modulePath,
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		expect(validation.command.name).toBe("list");
	});

	test("object-shaped commandless default export is left to selected command validation", async () => {
		const modulePath = await createModule("export default { name: 'greet' };\n");

		const loaded = await loadNsExtensionContribution({ type: "file", path: modulePath });

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(
			validateNsExtensionContribution(loaded.defaultExport, "greet", modulePath),
		).toMatchObject({
			ok: false,
			message: expect.stringContaining('expected a command entry named "greet" in commands[]'),
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

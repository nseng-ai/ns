import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateSdlExtensionContribution } from "../../src/command-registry.ts";
import { loadSdlExtensionContribution } from "../../src/extension-loader.ts";
import { z, type SdlCommand } from "../../src/sdk.ts";

const tempDirs: string[] = [];

async function createModule(source: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-loader-"));
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
import { defineExtension, ok, z } from "@asdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "greet",
	description: "Say hello.",
	schema: z.object({ loud: z.boolean().default(false) }),
	run(_ctx, request) { return ok(request.loud ? "HELLO" : "hello"); },
}],
});
`);

		const loaded = await loadSdlExtensionContribution(modulePath);

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const validation = validateSdlExtensionContribution(loaded.defaultExport, "greet", modulePath);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const command: SdlCommand | undefined = validation.command;
		expect(command?.name).toBe("greet");
		expect(command?.schema).toBeInstanceOf(z.ZodObject);
	});

	test("object-shaped commandless default export is left to selected command validation", async () => {
		const modulePath = await createModule("export default { name: 'greet' };\n");

		const loaded = await loadSdlExtensionContribution(modulePath);

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(validateSdlExtensionContribution(loaded.defaultExport, "greet", modulePath)).toMatchObject({
			ok: false,
			message: expect.stringContaining("expected a command entry named \"greet\" in commands[]"),
		});
	});

	test("import failures are structured errors", async () => {
		const modulePath = await createModule("throw new Error('boom');\n");

		const loaded = await loadSdlExtensionContribution(modulePath);

		expect(loaded).toMatchObject({
			ok: false,
			diagnostic: { code: "sdl_extension_contribution_import_failed", path: modulePath },
		});
	});
});

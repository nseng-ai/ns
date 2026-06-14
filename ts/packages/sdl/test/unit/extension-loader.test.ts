import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateSdlCommand } from "../../src/command-registry.ts";
import { loadSdlCommandEntry } from "../../src/extension-loader.ts";
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
import { defineCommand, ok, z } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "greet",
	description: "Say hello.",
	schema: z.object({ loud: z.boolean().default(false) }),
	run(_ctx, request) { return ok(request.loud ? "HELLO" : "hello"); },
});
`);

		const loaded = await loadSdlCommandEntry(modulePath);

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const validation = validateSdlCommand(loaded.defaultExport, "greet", modulePath);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const command: SdlCommand | undefined = validation.command;
		expect(command?.name).toBe("greet");
		expect(command?.schema).toBeInstanceOf(z.ZodObject);
	});

	test("invalid default export is left to command validation", async () => {
		const modulePath = await createModule("export default { name: 'greet' };\n");

		const loaded = await loadSdlCommandEntry(modulePath);

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(validateSdlCommand(loaded.defaultExport, "greet", modulePath)).toMatchObject({
			ok: false,
			message: expect.stringContaining("command description must be a string"),
		});
	});

	test("import failures are structured errors", async () => {
		const modulePath = await createModule("throw new Error('boom');\n");

		const loaded = await loadSdlCommandEntry(modulePath);

		expect(loaded).toMatchObject({
			ok: false,
			diagnostic: { code: "extension_command_import_failed", path: modulePath },
		});
	});
});

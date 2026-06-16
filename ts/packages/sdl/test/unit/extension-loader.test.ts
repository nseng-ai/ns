import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createExtensionApi } from "../../src/extension-api.ts";
import { loadExtensionFactory } from "../../src/extension-loader.ts";
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
	test("loads a TypeScript extension factory with SDK identity", async () => {
		const modulePath = await createModule(`
import type { ExtensionAPI } from "@asdl/sdl/sdk";
import { defineCommand, ok, z } from "@asdl/sdl/sdk";

export default function extension(api: ExtensionAPI): void {
	api.registerCommand(defineCommand({
		name: "greet",
		description: "Say hello.",
		schema: z.object({ loud: z.boolean().default(false) }),
		run(_ctx, request) { return ok(request.loud ? "HELLO" : "hello"); },
	}));
}
`);

		const loaded = await loadExtensionFactory(modulePath);

		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		const created = createExtensionApi({ level: "project", label: "test", path: modulePath });
		await loaded.factory(created.api);
		const command = created.contributions[0]?.command as SdlCommand | undefined;
		expect(command?.name).toBe("greet");
		expect(command?.schema).toBeInstanceOf(z.ZodObject);
	});

	test("non-function default export is a structured error", async () => {
		const modulePath = await createModule("export default { nope: true };\n");

		const loaded = await loadExtensionFactory(modulePath);

		expect(loaded).toMatchObject({
			ok: false,
			diagnostic: { code: "extension_default_not_function", path: modulePath },
		});
	});
});

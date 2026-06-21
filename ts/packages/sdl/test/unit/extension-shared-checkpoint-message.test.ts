import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_CHECKPOINT_HELPER_PATH = join(
	REPO_ROOT,
	".sdl/extensions/shared/checkpoint-message.ts",
);

interface SharedCheckpointModule {
	prepareCheckpointMessage: unknown;
}

describe("project extension shared checkpoint message helper", () => {
	test("reaches the package implementation instead of carrying checkpoint flow", async () => {
		const sharedModule = await createSdlJiti().import(SHARED_CHECKPOINT_HELPER_PATH);
		assertSharedCheckpointModule(sharedModule);

		expect(typeof sharedModule.prepareCheckpointMessage).toBe("function");
	});

	test("keeps the helper as a package re-export shim", async () => {
		const source = await readFile(SHARED_CHECKPOINT_HELPER_PATH, "utf8");

		expect(source).toContain("@sdl/sdl/checkpoint-flow");
		expect(source).not.toContain("function buildCheckpointUserPrompt");
		expect(source).not.toContain("function validateCheckpointMessage");
		expect(source).not.toContain("function buildCheckpointDiffPromptSection");
	});
});

function assertSharedCheckpointModule(value: unknown): asserts value is SharedCheckpointModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared checkpoint helper module object.");
	}
	if (!("prepareCheckpointMessage" in value)) {
		throw new Error("Expected shared checkpoint helper to export prepareCheckpointMessage.");
	}
}

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_TEXT_HELPER_PATH = join(REPO_ROOT, ".sdl/extensions/shared/text-helpers.ts");

interface SharedTextHelpersModule {
	draftChangesSummary: unknown;
	preparePrDescription: unknown;
}

describe("project extension shared text helpers", () => {
	test("reach package implementations instead of carrying copied text flows", async () => {
		const sharedModule = await createSdlJiti().import(SHARED_TEXT_HELPER_PATH);
		assertSharedTextHelpersModule(sharedModule);

		expect(typeof sharedModule.draftChangesSummary).toBe("function");
		expect(typeof sharedModule.preparePrDescription).toBe("function");
	});

	test("keep the helper as package re-export shims", async () => {
		const source = await readFile(SHARED_TEXT_HELPER_PATH, "utf8");

		expect(source).toContain("@sdl/sdl/changes-model-summary");
		expect(source).toContain("@sdl/sdl/pr-description");
		expect(source).not.toContain("function parsePrDescriptionOutput");
		expect(source).not.toContain("prepareRepairedText");
		expect(source).not.toContain("CHANGES_SUMMARY_SYSTEM_PROMPT");
		expect(source).not.toContain("LOCKFILE_BASENAMES");
		expect(source).not.toContain("PR_DESCRIPTION_GENERATOR_VERSION");
	});
});

function assertSharedTextHelpersModule(value: unknown): asserts value is SharedTextHelpersModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared text helper module object.");
	}
	if (!("draftChangesSummary" in value)) {
		throw new Error("Expected shared text helper to export draftChangesSummary.");
	}
	if (!("preparePrDescription" in value)) {
		throw new Error("Expected shared text helper to export preparePrDescription.");
	}
}

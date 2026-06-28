import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const SHARED_TEXT_GENERATION_HELPER_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/shared/text-generation.ts",
);
const SUBMIT_EXTENSION_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/submit.ts",
);

type ModelSelector = (env: Record<string, string | undefined>) => string;

interface SharedTextGenerationModule {
	CHECKPOINT_MODEL_ENV: unknown;
	CHANGES_MODEL_ENV: unknown;
	selectCheckpointModelRef: ModelSelector;
	selectChangesModelRef: ModelSelector;
}

describe("project extension shared text generation helper", () => {
	test("reaches the package implementation through the extension loader", async () => {
		const sharedModule = await import(SHARED_TEXT_GENERATION_HELPER_PATH);
		assertSharedTextGenerationModule(sharedModule);

		const canonicalModule = await import("@sdl/capability-kit/text-generation");

		expect(sharedModule.CHECKPOINT_MODEL_ENV).toBe(canonicalModule.CHECKPOINT_MODEL_ENV);
		expect(sharedModule.CHANGES_MODEL_ENV).toBe(canonicalModule.CHANGES_MODEL_ENV);
		expect(
			sharedModule.selectCheckpointModelRef({ SDL_CHECKPOINT_MODEL: "custom-checkpoint" }),
		).toBe(canonicalModule.selectCheckpointModelRef({ SDL_CHECKPOINT_MODEL: "custom-checkpoint" }));
		expect(sharedModule.selectChangesModelRef({ SDL_CHANGES_MODEL: "custom-changes" })).toBe(
			canonicalModule.selectChangesModelRef({ SDL_CHANGES_MODEL: "custom-changes" }),
		);
	});

	test("keeps selector implementation out of project-local extension files", async () => {
		const sharedSource = await readFile(SHARED_TEXT_GENERATION_HELPER_PATH, "utf8");
		const submitSource = await readFile(SUBMIT_EXTENSION_PATH, "utf8");

		expect(sharedSource).toContain("@sdl/capability-kit/text-generation");
		expect(sharedSource).not.toContain("function firstEnvValue");
		expect(sharedSource).not.toContain("DEFAULT_FAST_MODEL_REF");

		expect(submitSource).not.toContain("function selectCheckpointModelRef");
		expect(submitSource).not.toContain("function firstEnvValue");
		expect(submitSource).not.toContain("var CHECKPOINT_MODEL_ENV");
	});
});

function assertSharedTextGenerationModule(
	value: unknown,
): asserts value is SharedTextGenerationModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared text generation helper module object.");
	}
	if (
		!("selectCheckpointModelRef" in value) ||
		typeof value.selectCheckpointModelRef !== "function"
	) {
		throw new Error("Expected shared text generation helper to export selectCheckpointModelRef.");
	}
	if (!("selectChangesModelRef" in value) || typeof value.selectChangesModelRef !== "function") {
		throw new Error("Expected shared text generation helper to export selectChangesModelRef.");
	}
	if (!("CHECKPOINT_MODEL_ENV" in value)) {
		throw new Error("Expected shared text generation helper to export CHECKPOINT_MODEL_ENV.");
	}
	if (!("CHANGES_MODEL_ENV" in value)) {
		throw new Error("Expected shared text generation helper to export CHANGES_MODEL_ENV.");
	}
}

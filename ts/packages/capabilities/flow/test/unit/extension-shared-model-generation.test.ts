import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@sdl/capability-kit/text-generation";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const CHANGES_MODEL_GENERATION_HELPER_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/changes/model-generation.ts",
);
const CHECKPOINT_MODEL_GENERATION_HELPER_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/checkpoint/model-generation.ts",
);

const validCheckpointMessage = `[cp] Update model helper

- Route checkpoint draft through helper`;
const invalidCheckpointMessage = `[cp] Update model helper

- Route checkpoint draft through helper
- Keep validation in package helper
- Preserve model selection behavior
- Add one extra bullet that should be rejected`;

interface FlowModelGenerationContextFixture {
	env: Record<string, string | undefined>;
	textGenerator: TextGenerator;
}

type ChangesSummaryResult = { ok: true; summaryText: string } | { ok: false; error: string };

type CheckpointMessageResult =
	| { ok: true; message: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

interface SharedModelGenerationModule {
	prepareFlowChangesSummary: (
		ctx: FlowModelGenerationContextFixture,
		snapshot: { branch: string; status: string; diff: string },
	) => Promise<ChangesSummaryResult>;
	prepareFlowCheckpointMessage: (
		ctx: FlowModelGenerationContextFixture,
		pending: { status: string; diff: string },
	) => Promise<CheckpointMessageResult>;
}

class ScriptedTextGenerator implements TextGenerator {
	private readonly results: TextGenerationResult[];
	readonly calls: TextGenerationRequest[] = [];

	constructor(results: TextGenerationResult[]) {
		this.results = [...results];
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		this.calls.push({ ...request });
		return this.results.shift() ?? { ok: false, error: "missing scripted text result" };
	}
}

describe("project extension shared model generation helper", () => {
	test("exports flow command-facing generation helpers", async () => {
		const sharedModule = await loadSharedModelGenerationModule();

		expect(typeof sharedModule.prepareFlowChangesSummary).toBe("function");
		expect(typeof sharedModule.prepareFlowCheckpointMessage).toBe("function");
	});

	test("delegates changes summaries with package-owned model selection", async () => {
		const sharedModule = await loadSharedModelGenerationModule();
		const textGenerator = new ScriptedTextGenerator([
			{ ok: true, text: "- Share model generation wiring" },
		]);

		const result = await sharedModule.prepareFlowChangesSummary(
			{
				env: { SDL_CHANGES_MODEL: "openai-codex/custom-changes" },
				textGenerator,
			},
			{
				branch: "flow-model-generation-helper",
				status: " M ts/packages/capabilities/flow/src/sdl/commands/changes.ts\n",
				diff: "diff --git a/ts/packages/capabilities/flow/src/sdl/commands/changes.ts b/ts/packages/capabilities/flow/src/sdl/commands/changes.ts\n",
			},
		);

		expect(result).toEqual({ ok: true, summaryText: "- Share model generation wiring" });
		expect(textGenerator.calls).toHaveLength(1);
		expect(textGenerator.calls[0]).toMatchObject({
			modelRef: "openai-codex/custom-changes",
			operation: "changes-summary",
			reasoning: "low",
			maxTokens: 512,
		});
		expect(textGenerator.calls[0]?.prompt).toContain("## branch\n\nflow-model-generation-helper");
	});

	test("delegates checkpoint messages with flow-selected checkpoint model", async () => {
		const sharedModule = await loadSharedModelGenerationModule();
		const textGenerator = new ScriptedTextGenerator([{ ok: true, text: validCheckpointMessage }]);

		const result = await sharedModule.prepareFlowCheckpointMessage(
			{
				env: { SDL_CHECKPOINT_MODEL: "openai-codex/custom-checkpoint" },
				textGenerator,
			},
			{
				status: " M ts/packages/capabilities/flow/src/sdl/commands/cp.ts\n",
				diff: "diff --git a/ts/packages/capabilities/flow/src/sdl/commands/cp.ts b/ts/packages/capabilities/flow/src/sdl/commands/cp.ts\n",
			},
		);

		expect(result).toEqual({ ok: true, message: validCheckpointMessage, source: "model" });
		expect(textGenerator.calls).toHaveLength(1);
		expect(textGenerator.calls[0]).toMatchObject({
			modelRef: "openai-codex/custom-checkpoint",
			operation: "checkpoint-message",
			reasoning: "low",
			maxTokens: 512,
		});
	});

	test("keeps checkpoint repair delegated to the package helper", async () => {
		const sharedModule = await loadSharedModelGenerationModule();
		const textGenerator = new ScriptedTextGenerator([
			{ ok: true, text: invalidCheckpointMessage },
			{ ok: true, text: validCheckpointMessage },
		]);

		const result = await sharedModule.prepareFlowCheckpointMessage(
			{
				env: { SDL_CHECKPOINT_MODEL: "openai-codex/custom-checkpoint" },
				textGenerator,
			},
			{
				status: " M ts/packages/capabilities/flow/src/sdl/commands/autobranch.ts\n",
				diff: "diff --git a/ts/packages/capabilities/flow/src/sdl/commands/autobranch.ts b/ts/packages/capabilities/flow/src/sdl/commands/autobranch.ts\n",
			},
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.source).toBe("repaired_model");
			expect(result.feedback).toContain("too_many_bullets");
		}
		expect(textGenerator.calls).toHaveLength(2);
		expect(textGenerator.calls[0]).toMatchObject({
			modelRef: "openai-codex/custom-checkpoint",
			operation: "checkpoint-message",
		});
		expect(textGenerator.calls[1]).toMatchObject({
			modelRef: "openai-codex/custom-checkpoint",
			operation: "checkpoint-message",
		});
		expect(textGenerator.calls[1]?.prompt).toContain("## previous invalid draft");
		expect(textGenerator.calls[1]?.prompt).toContain(invalidCheckpointMessage);
		expect(textGenerator.calls[1]?.prompt).toContain("## validation feedback");
	});
});

async function loadSharedModelGenerationModule(): Promise<SharedModelGenerationModule> {
	const changesModule = await import(CHANGES_MODEL_GENERATION_HELPER_PATH);
	const checkpointModule = await import(CHECKPOINT_MODEL_GENERATION_HELPER_PATH);
	const sharedModule = { ...changesModule, ...checkpointModule };
	assertSharedModelGenerationModule(sharedModule);
	return sharedModule;
}

function assertSharedModelGenerationModule(
	value: unknown,
): asserts value is SharedModelGenerationModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared model generation helper module object.");
	}
	if (
		!("prepareFlowChangesSummary" in value) ||
		typeof value.prepareFlowChangesSummary !== "function"
	) {
		throw new Error("Expected shared model generation helper to export prepareFlowChangesSummary.");
	}
	if (
		!("prepareFlowCheckpointMessage" in value) ||
		typeof value.prepareFlowCheckpointMessage !== "function"
	) {
		throw new Error(
			"Expected shared model generation helper to export prepareFlowCheckpointMessage.",
		);
	}
}

import { describe, expect, test } from "vitest";

import {
	buildCheckpointUserPrompt,
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
} from "@asdl/sdl/checkpoint-flow";
import type {
	TextGenerationGateway,
	TextGenerationRequest,
	TextGenerationResult,
} from "@asdl/sdl/text-generation";

const validMessage = `[cp] Update checkpoint tests

- Add validator coverage`;
const fourBulletMessage = `[cp] Resolve checkpoint import drift

- Update checkpoint objective disposition
- Switch extension imports to canonical modules
- Refresh checkpoint validation coverage
- Add one extra bullet that should be rejected`;

class ScriptedTextGenerationGateway implements TextGenerationGateway {
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

function ok(stdout = "", stderr = ""): CommandResult {
	return { code: 0, stdout, stderr };
}

function fail(stderr: string): CommandResult {
	return { code: 1, stdout: "", stderr };
}

function largeDiffWithSentinel(): string {
	return [
		"diff --git a/src/large-one.ts b/src/large-one.ts",
		"index 1111111..2222222 100644",
		"--- a/src/large-one.ts",
		"+++ b/src/large-one.ts",
		"@@ -1,2 +1,2 @@",
		`+${"a".repeat(30_000)}`,
		"FULL_DIFF_SENTINEL_SHOULD_NOT_APPEAR",
		"diff --git a/src/large-two.ts b/src/large-two.ts",
		"index 3333333..4444444 100644",
		"--- a/src/large-two.ts",
		"+++ b/src/large-two.ts",
		"@@ -1 +1 @@",
		"+small follow-up",
	].join("\n");
}

describe("buildCheckpointUserPrompt", () => {
	test("ordinary small diff remains present in the prompt", () => {
		const prompt = buildCheckpointUserPrompt({
			status: " M src/app.ts\n",
			diff: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n",
		});

		expect(prompt).toContain("## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts");
		expect(prompt).toContain("+export const value = true;");
		expect(prompt).not.toContain("Large diff compacted");
	});

	test("large diff is compacted with paths and omitted markers", () => {
		const prompt = buildCheckpointUserPrompt({
			status: " M src/large-one.ts\n M src/large-two.ts\n",
			diff: largeDiffWithSentinel(),
		});

		expect(prompt.length).toBeLessThan(26_000);
		expect(prompt).toContain("Large diff compacted for checkpoint message generation.");
		expect(prompt).toContain("Detected file sections: 2");
		expect(prompt).toContain("- src/large-one.ts");
		expect(prompt).toContain("- src/large-two.ts");
		expect(prompt).toContain("[... omitted ");
		expect(prompt).toContain("Omitted summary:");
		expect(prompt).not.toContain("FULL_DIFF_SENTINEL_SHOULD_NOT_APPEAR");
	});

	test("large diff without file sections uses a bounded head and tail excerpt", () => {
		const prompt = buildCheckpointUserPrompt({
			status: " M generated.txt\n",
			diff: `${"head".repeat(7_000)}\nMIDDLE_SENTINEL_SHOULD_NOT_APPEAR\n${"tail".repeat(7_000)}`,
		});

		expect(prompt.length).toBeLessThan(26_000);
		expect(prompt).toContain("Detected file sections: 0");
		expect(prompt).toContain("No diff --git file sections were detected; using head/tail excerpt.");
		expect(prompt).toContain("[... omitted ");
		expect(prompt).toContain("chars from compacted diff without file sections");
		expect(prompt).toContain("headheadhead");
		expect(prompt).toContain("tailtailtail");
		expect(prompt).not.toContain("MIDDLE_SENTINEL_SHOULD_NOT_APPEAR");
	});

	test("empty diff keeps the existing untracked-file placeholder", () => {
		const prompt = buildCheckpointUserPrompt({ status: "?? notes.md\n", diff: "\n" });

		expect(prompt).toContain("(no tracked diff; rely on untracked filenames in status)");
	});
});

describe("prepareCheckpointMessage", () => {
	test("valid first model draft returns after one generation call", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([{ ok: true, text: validMessage }]);

		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result).toEqual({ ok: true, message: validMessage, source: "model" });
		expect(textGeneration.calls).toHaveLength(1);
		expect(textGeneration.calls[0]).toMatchObject({
			modelRef: "openai-codex/gpt-5.4-mini",
			operation: "checkpoint-message",
			maxTokens: 512,
			reasoning: "low",
		});
		expect(textGeneration.calls[0]?.prompt).toContain("## git status --porcelain\n\n M file.ts");
	});

	test("invalid first draft sends validation feedback and accepts repaired draft", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: fourBulletMessage },
			{ ok: true, text: validMessage },
		]);

		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.source).toBe("repaired_model");
			expect(result.feedback).toContain("too_many_bullets");
		}
		expect(textGeneration.calls).toHaveLength(2);
		expect(textGeneration.calls[1]?.prompt).toContain("## previous invalid draft");
		expect(textGeneration.calls[1]?.prompt).toContain(fourBulletMessage);
		expect(textGeneration.calls[1]?.prompt).toContain("## validation feedback");
		expect(textGeneration.calls[1]?.prompt).toContain("too_many_bullets");
		expect(textGeneration.calls[1]?.prompt).not.toContain("deterministic validation feedback");
	});

	test("repair prompt for large diff stays compacted", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: fourBulletMessage },
			{ ok: true, text: validMessage },
		]);

		const result = await prepareCheckpointMessage({
			status: " M src/large-one.ts\n M src/large-two.ts\n",
			diff: largeDiffWithSentinel(),
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result.ok).toBe(true);
		expect(textGeneration.calls).toHaveLength(2);
		for (const call of textGeneration.calls) {
			expect(call.prompt.length).toBeLessThan(27_000);
			expect(call.prompt).toContain("Large diff compacted for checkpoint message generation.");
			expect(call.prompt).toContain("- src/large-one.ts");
			expect(call.prompt).not.toContain("FULL_DIFF_SENTINEL_SHOULD_NOT_APPEAR");
		}
		expect(textGeneration.calls[1]?.prompt).toContain("## previous invalid draft");
		expect(textGeneration.calls[1]?.prompt).toContain("## validation feedback");
	});

	test("repair prompt caps oversized invalid model output", async () => {
		const oversizedInvalidDraft = `not a checkpoint message ${"q".repeat(30_000)}\nREPAIR_DRAFT_SENTINEL_SHOULD_NOT_APPEAR`;
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: oversizedInvalidDraft },
			{ ok: true, text: validMessage },
		]);

		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff --git a/file.ts b/file.ts\n+code\n",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result.ok).toBe(true);
		const repairPrompt = textGeneration.calls[1]?.prompt ?? "";
		expect(repairPrompt.length).toBeLessThan(35_000);
		expect(repairPrompt).toContain("[... omitted ");
		expect(repairPrompt).toContain("chars from previous invalid draft");
		expect(repairPrompt).toContain("chars from validation feedback");
		expect(repairPrompt).not.toContain("REPAIR_DRAFT_SENTINEL_SHOULD_NOT_APPEAR");
	});

	test("invalid first and second drafts return failure instead of template recovery", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: fourBulletMessage },
			{ ok: true, text: "still invalid" },
		]);

		const result = await prepareCheckpointMessage({
			status: " M extensions/cp.ts\n",
			diff: "diff --git a/extensions/cp.ts b/extensions/cp.ts\n",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain(
				"Model produced an invalid checkpoint message after 2 attempts.",
			);
			expect(result.error).toContain("missing_cp_prefix");
		}
		expect(textGeneration.calls).toHaveLength(2);
	});

	test("first-call generation error returns failure", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([{ ok: false, error: "auth failed" }]);

		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result).toEqual({ ok: false, error: "auth failed" });
		expect(textGeneration.calls).toHaveLength(1);
	});

	test("second-call generation error returns failure", async () => {
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: fourBulletMessage },
			{ ok: false, error: "model unavailable" },
		]);

		const result = await prepareCheckpointMessage({
			status: " M extensions/cp.ts\n",
			diff: "diff --git a/extensions/cp.ts b/extensions/cp.ts\n",
			modelRef: "openai-codex/gpt-5.4-mini",
			textGeneration,
		});

		expect(result).toEqual({ ok: false, error: "model unavailable" });
		expect(textGeneration.calls).toHaveLength(2);
	});
});

describe("createCommitWithPreparedMessage", () => {
	test("runs git add, git commit -F, and git log in order", async () => {
		const calls: Array<{ command: string; args: string[]; cwd: string; timeout: number }> = [];
		const result = await createCommitWithPreparedMessage({
			cwd: "/repo",
			message: validMessage,
			exec: async (command, args, cwd, timeout) => {
				calls.push({ command, args, cwd, timeout });
				if (args[0] === "log") {
					return ok("abc123 [cp] Update checkpoint tests\n");
				}
				return ok();
			},
		});

		expect(result).toEqual({ summary: "abc123 [cp] Update checkpoint tests" });
		expect(calls.map((call) => [call.command, ...call.args.slice(0, 3)])).toEqual([
			["git", "add", "-A"],
			["git", "commit", "-F", expect.any(String)],
			["git", "log", "-1", "--oneline"],
		]);
	});

	test("commit hook failure returns an error without retrying or bypassing hooks", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const result = await createCommitWithPreparedMessage({
			cwd: "/repo",
			message: validMessage,
			exec: async (command, args) => {
				calls.push({ command, args });
				if (args[0] === "commit") {
					return fail("pre-commit hook failed");
				}
				return ok();
			},
		});

		expect(result).toEqual({ error: "Checkpoint commit failed.\nexit 1: pre-commit hook failed" });
		expect(calls.map((call) => call.args[0])).toEqual(["add", "commit"]);
		expect(calls.flatMap((call) => call.args)).not.toContain("--no-verify");
		expect(calls.flatMap((call) => call.args)).not.toContain("--amend");
	});
});

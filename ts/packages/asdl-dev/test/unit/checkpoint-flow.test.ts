import { describe, expect, test } from "vitest";

import { createCommitWithPreparedMessage, prepareCheckpointMessage, type CommandResult } from "asdl-dev/checkpoint-flow";
import type { TextGenerationGateway, TextGenerationRequest, TextGenerationResult } from "asdl-dev/text-generation";

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
			expect(result.error).toContain("Model produced an invalid checkpoint message after 2 attempts.");
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

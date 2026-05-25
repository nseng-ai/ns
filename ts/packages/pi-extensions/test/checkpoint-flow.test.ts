import { describe, expect, test } from "bun:test";
import { createCommitWithPreparedMessage, prepareCheckpointMessage, type CommandResult, type DraftCheckpointRequest } from "../src/checkpoint-flow.ts";
import { validateCheckpointMessage } from "../src/checkpoint-message.ts";

const validMessage = `[cp] Update checkpoint tests

- Add validator coverage`;
const fourBulletMessage = `[cp] Resolve vibecoded pi-coding-agent import drift

- Update pi-extension-deepening objective/roadmap candidate 10 disposition
- Switch .pi/extensions land/submit imports to @earendil-works
- Refresh docs/pi README vibecoded vs promotion statuses
- Add .asdl/objectives/pi-extension-deepening/updates/2026-05-25-vibecoded-extension-dispositions.md`;

function ok(stdout = "", stderr = ""): CommandResult {
	return { code: 0, stdout, stderr };
}

function fail(stderr: string): CommandResult {
	return { code: 1, stdout: "", stderr };
}

describe("prepareCheckpointMessage", () => {
	test("valid first model draft returns after one draft call", async () => {
		const calls: DraftCheckpointRequest[] = [];
		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			draft: async (request) => {
				calls.push(request);
				return { output: validMessage };
			},
		});

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ ok: true, message: validMessage, source: "model" });
	});

	test("invalid first draft sends deterministic feedback and accepts repaired draft", async () => {
		const calls: DraftCheckpointRequest[] = [];
		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			draft: async (request) => {
				calls.push(request);
				return { output: calls.length === 1 ? fourBulletMessage : validMessage };
			},
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.source).toBe("repaired_model");
		}
		expect(calls).toHaveLength(2);
		expect(calls[1]?.previousDraft).toBe(fourBulletMessage);
		expect(calls[1]?.validationFeedback).toContain("too_many_bullets");
		expect(calls[1]?.validationFeedback).toContain("found 4, max 3");
	});

	test("invalid first and second drafts return a validating fallback", async () => {
		const result = await prepareCheckpointMessage({
			status: " M extensions/cp.ts\n",
			diff: "diff --git a/extensions/cp.ts b/extensions/cp.ts\n",
			draft: async () => ({ output: fourBulletMessage }),
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.source).toBe("fallback");
			expect(validateCheckpointMessage(result.message).ok).toBe(true);
		}
	});

	test("first-call infrastructure error returns failure without fallback", async () => {
		let calls = 0;
		const result = await prepareCheckpointMessage({
			status: " M file.ts\n",
			diff: "diff",
			draft: async () => {
				calls += 1;
				return { error: "auth failed" };
			},
		});

		expect(calls).toBe(1);
		expect(result).toEqual({ ok: false, error: "auth failed" });
	});

	test("second-call infrastructure error after invalid text can fallback", async () => {
		let calls = 0;
		const result = await prepareCheckpointMessage({
			status: " M extensions/cp.ts\n",
			diff: "diff --git a/extensions/cp.ts b/extensions/cp.ts\n",
			draft: async () => {
				calls += 1;
				return calls === 1 ? { output: fourBulletMessage } : { error: "model unavailable" };
			},
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.source).toBe("fallback");
			expect(validateCheckpointMessage(result.message).ok).toBe(true);
		}
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

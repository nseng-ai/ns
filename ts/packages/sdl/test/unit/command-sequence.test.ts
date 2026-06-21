import { describe, expect, test } from "vitest";

import {
	commandEvidenceFailure,
	commandSteps,
	runSdlCommandSequence,
} from "../../src/command-sequence.ts";
import { createSdlCommandResult, type SdlContext } from "../../src/sdk.ts";
import type { ExecResult, SdlCommandResult, TextGenerator } from "../../src/sdk.ts";

interface RecordedCommand {
	command: string;
	args: readonly string[];
	stdin?: string | undefined;
	timeoutMs?: number | undefined;
}

function createContext(results: readonly ExecResult[]): {
	ctx: SdlContext;
	recorded: RecordedCommand[];
} {
	const recorded: RecordedCommand[] = [];
	let index = 0;
	const model: TextGenerator = {
		async generateText() {
			return { ok: false, error: "unused" };
		},
	};
	return {
		recorded,
		ctx: {
			cwd: "/repo",
			env: {},
			model,
			async exec(command, args, options): Promise<SdlCommandResult> {
				recorded.push({
					command,
					args,
					...(options?.stdin === undefined ? {} : { stdin: options.stdin }),
					...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
				});
				const result = results[index] ?? { code: 0, stdout: "", stderr: "", killed: false };
				index += 1;
				return createSdlCommandResult({ command, args, cwd: "/repo", result });
			},
		},
	};
}

function okResult(stdout = ""): ExecResult {
	return { code: 0, stdout, stderr: "", killed: false };
}

function failedResult(stderr = "failed"): ExecResult {
	return { code: 1, stdout: "", stderr, killed: false };
}

describe("runSdlCommandSequence", () => {
	test("captures typed stdout outputs and runs steps in order", async () => {
		const { ctx, recorded } = createContext([okResult("/repo\n"), okResult(" M file.ts\n")]);
		const git = commandSteps("git", { timeoutMs: 30_000 });

		const result = await runSdlCommandSequence(ctx, [
			git.trimmedStdout("root", ["rev-parse", "--show-toplevel"], () => "root failed"),
			git.stdout("status", ["status", "--porcelain=v1"], () => "status failed"),
		]);

		expect(result).toEqual({ ok: true, outputs: { root: "/repo", status: " M file.ts\n" } });
		expect(recorded).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"], timeoutMs: 30_000 },
			{ command: "git", args: ["status", "--porcelain=v1"], timeoutMs: 30_000 },
		]);
	});

	test("short-circuits on the first failed command", async () => {
		const { ctx, recorded } = createContext([
			okResult("one"),
			failedResult("boom"),
			okResult("three"),
		]);
		const git = commandSteps("git");

		const result = await runSdlCommandSequence(ctx, [
			git.stdout("first", ["first"], () => "first failed"),
			git.stdout("second", ["second"], () => "second failed"),
			git.stdout("third", ["third"], () => "third failed"),
		]);

		expect(result).toEqual({ ok: false, error: "second failed" });
		expect(recorded.map((command) => command.args[0])).toEqual(["first", "second"]);
	});

	test("formats command evidence failures", async () => {
		const { ctx } = createContext([failedResult("fatal")]);
		const git = commandSteps("git");

		const result = await runSdlCommandSequence(ctx, [
			git.run(["push"], commandEvidenceFailure("Push failed.")),
		]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Push failed.");
			expect(result.error).toContain("git push");
			expect(result.error).toContain("fatal");
		}
	});
});

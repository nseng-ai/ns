import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { execGitCommonDir } from "@nseng-ai/capability-kit/graphite/stack";

interface RecordedCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

function fakeExec(result: Partial<Extract<ExecResult, { type: "exited" }>>): {
	api: CommandExecApi;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const api: CommandExecApi = {
		async exec(command, args, options) {
			calls.push({ command, args: [...args], options });
			return {
				type: "exited",
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				code: result.code ?? 0,
				signal: result.signal ?? null,
			};
		},
	};
	return { api, calls };
}

describe("execGitCommonDir", () => {
	test("returns an absolute common dir unchanged and runs git rev-parse", async () => {
		const fake = fakeExec({ stdout: "/repo/.git\n" });

		const result = await execGitCommonDir(fake.api, "/repo");

		expect(result).toBe("/repo/.git");
		expect(fake.calls).toEqual([
			{ command: "git", args: ["rev-parse", "--git-common-dir"], options: { cwd: "/repo" } },
		]);
	});

	test("resolves a relative common dir against cwd", async () => {
		const fake = fakeExec({ stdout: ".git\n" });
		expect(await execGitCommonDir(fake.api, "/repo")).toBe("/repo/.git");
	});

	test("returns null on a nonzero exit", async () => {
		const fake = fakeExec({
			type: "exited",
			stdout: "",
			stderr: "fatal: not a git repository",
			code: 128,
			signal: null,
		});
		expect(await execGitCommonDir(fake.api, "/repo")).toBeNull();
	});

	test("returns null when the resolved output is empty", async () => {
		const fake = fakeExec({ stdout: "   \n" });
		expect(await execGitCommonDir(fake.api, "/repo")).toBeNull();
	});
});

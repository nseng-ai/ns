import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecOptions, ExecResult } from "@asdl/core/exec";
import { GITHUB_CLI_STARTUP_ERROR_CODE, GITHUB_CLI_TIMEOUT_MS, runGitHubCli, runGitHubCliAsExecResult } from "@asdl/core/github-cli";

describe("runGitHubCli", () => {
	test("runs gh with default timeout and returns command metadata", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[]; readonly options?: ExecOptions | undefined }> = [];
		const runner: CommandRunner = async (command, args, options) => {
			calls.push({ command, args: [...args], options });
			return { stdout: "ok", stderr: "", code: 0, killed: false };
		};

		const result = await runGitHubCli({ runner, args: ["pr", "view", "12"], cwd: "/repo" });

		expect(result).toMatchObject({ type: "completed", command: ["gh", "pr", "view", "12"], displayCommand: "gh pr view 12" });
		expect(calls).toEqual([{ command: "gh", args: ["pr", "view", "12"], options: { cwd: "/repo", timeout: GITHUB_CLI_TIMEOUT_MS } }]);
	});

	test("runs gh through runner with explicit options", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[]; readonly options?: ExecOptions | undefined }> = [];
		const runner: CommandRunner = async (command, args, options) => {
			calls.push({ command, args: [...args], options });
			return { stdout: "{}", stderr: "", code: 0, killed: false };
		};
		const env = { GH_TOKEN: "token" } satisfies NodeJS.ProcessEnv;
		const controller = new AbortController();

		const result = await runGitHubCli({ runner, args: ["api", "repos/{owner}/{repo}"], cwd: "/repo", env, signal: controller.signal, timeoutMs: 1_234 });

		expect(result).toMatchObject({ type: "completed", command: ["gh", "api", "repos/{owner}/{repo}"], displayCommand: "gh api 'repos/{owner}/{repo}'" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("gh");
		expect(calls[0]?.args).toEqual(["api", "repos/{owner}/{repo}"]);
		expect(calls[0]?.options).toMatchObject({ cwd: "/repo", env, timeout: 1_234 });
		expect(calls[0]?.options?.signal).toBe(controller.signal);
	});

	test("returns startup failure metadata when runner throws", async () => {
		const runner: CommandRunner = async () => {
			throw new Error("gh crashed");
		};

		expect(await runGitHubCli({ runner, args: ["pr", "view", "12"], cwd: "/repo" })).toEqual({
			type: "startup_error",
			command: ["gh", "pr", "view", "12"],
			displayCommand: "gh pr view 12",
			message: "gh crashed",
		});
	});

	test("returns completed ExecResult unchanged", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[]; readonly options?: ExecOptions | undefined }> = [];
		const completedResult: ExecResult = { stdout: "ok", stderr: "", code: 0, killed: false };
		const runner: CommandRunner = async (command, args, options) => {
			calls.push({ command, args: [...args], options });
			return completedResult;
		};

		const result = await runGitHubCliAsExecResult({ runner, args: ["pr", "view", "12"], cwd: "/repo" });

		expect(result).toBe(completedResult);
		expect(calls).toEqual([{ command: "gh", args: ["pr", "view", "12"], options: { cwd: "/repo", timeout: GITHUB_CLI_TIMEOUT_MS } }]);
	});

	test("converts startup errors to ExecResult failures", async () => {
		const runner: CommandRunner = async () => {
			throw new Error("gh crashed");
		};

		expect(await runGitHubCliAsExecResult({ runner, args: ["pr", "view", "12"], cwd: "/repo" })).toEqual({
			stdout: "",
			stderr: "gh crashed",
			code: GITHUB_CLI_STARTUP_ERROR_CODE,
			killed: false,
		});
	});
});

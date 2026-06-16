import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecOptions } from "@asdl/core/exec";
import { GITHUB_CLI_TIMEOUT_MS, runGitHubCli } from "@asdl/core/github-cli";

describe("runGitHubCli", () => {
	test("runs gh with default timeout and returns command metadata", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[]; readonly options?: ExecOptions | undefined }> = [];
		const runner: CommandRunner = async (command, args, options = {}) => {
			calls.push({ command, args: [...args], options });
			return { stdout: "ok", stderr: "", code: 0, killed: false };
		};

		const result = await runGitHubCli({ runner, args: ["pr", "view", "12"], cwd: "/repo" });

		expect(result).toMatchObject({ type: "completed", command: ["gh", "pr", "view", "12"], displayCommand: "gh pr view 12" });
		expect(calls).toEqual([{ command: "gh", args: ["pr", "view", "12"], options: { cwd: "/repo", timeout: GITHUB_CLI_TIMEOUT_MS } }]);
	});

	test("returns startup failure metadata when the runner throws", async () => {
		const runner: CommandRunner = async () => {
			throw new Error("spawn gh ENOENT");
		};

		expect(await runGitHubCli({ runner, args: ["api", "repos/{owner}/{repo}"], cwd: "/repo" })).toEqual({
			type: "startup_error",
			command: ["gh", "api", "repos/{owner}/{repo}"],
			displayCommand: "gh api 'repos/{owner}/{repo}'",
			message: "spawn gh ENOENT",
		});
	});
});

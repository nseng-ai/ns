import {
	getGitRepositoryName,
	getWorktreeDescription,
	repositoryNameFromGitCommonDir,
	repositoryNameFromPath,
} from "@nseng-ai/extension-kit/worktree-description";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

interface Step {
	command: string;
	args: string[];
	result: ExecResult;
}

class FakeCommands implements CommandExecApi {
	private readonly steps: readonly Step[];
	private next = 0;

	constructor(steps: readonly Step[]) {
		this.steps = steps;
	}

	async exec(command: string, args: string[], _options?: ExecOptions): Promise<ExecResult> {
		const expected = this.steps[this.next++];
		if (expected === undefined) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		expect({ command, args }).toEqual({ command: expected.command, args: expected.args });
		return expected.result;
	}
}

function exited(stdout: string, code = 0): ExecResult {
	return { type: "exited", stdout, stderr: "", code, signal: null };
}

describe("getWorktreeDescription", () => {
	test("prefixes the branch with the origin repository name", async () => {
		const commands = new FakeCommands([
			{
				command: "git",
				args: ["remote", "get-url", "origin"],
				result: exited("git@github.com:owner/demo-repo.git\n"),
			},
		]);

		await expect(getWorktreeDescription(commands, "/worktree", "feature/x")).resolves.toBe(
			"demo-repo/feature/x",
		);
	});

	test("falls back to the bare branch name when no repository name resolves", async () => {
		const commands = new FakeCommands([
			{ command: "git", args: ["remote", "get-url", "origin"], result: exited("", 1) },
			{
				command: "git",
				args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
				result: exited("", 1),
			},
		]);

		await expect(getWorktreeDescription(commands, "/worktree", "feature/x")).resolves.toBe(
			"feature/x",
		);
	});
});

describe("getGitRepositoryName", () => {
	test("resolves the name from the git common dir when origin is missing", async () => {
		const commands = new FakeCommands([
			{ command: "git", args: ["remote", "get-url", "origin"], result: exited("", 1) },
			{
				command: "git",
				args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
				result: exited("/repos/demo-repo/.git\n"),
			},
		]);

		await expect(getGitRepositoryName(commands, "/worktree")).resolves.toBe("demo-repo");
	});
});

describe("repositoryNameFromPath", () => {
	test("strips the .git suffix from ssh and https remotes", () => {
		expect(repositoryNameFromPath("git@github.com:owner/demo.git")).toBe("demo");
		expect(repositoryNameFromPath("https://github.com/owner/demo.git")).toBe("demo");
	});

	test("returns undefined for empty input", () => {
		expect(repositoryNameFromPath("")).toBeUndefined();
	});
});

describe("repositoryNameFromGitCommonDir", () => {
	test("uses the parent directory of a .git common dir", () => {
		expect(repositoryNameFromGitCommonDir("/repos/demo/.git")).toBe("demo");
	});

	test("strips a bare-repository .git suffix", () => {
		expect(repositoryNameFromGitCommonDir("/repos/demo.git")).toBe("demo");
	});

	test("returns undefined for empty input", () => {
		expect(repositoryNameFromGitCommonDir("")).toBeUndefined();
	});
});

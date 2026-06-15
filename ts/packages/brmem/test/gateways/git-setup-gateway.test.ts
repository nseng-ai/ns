import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";

import { RealGitSetupGateway } from "../../src/git-setup-gateway.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("RealGitSetupGateway", () => {
	it("runs git config setup commands through the injected command executor", async () => {
		const commands = new RecordingCommands([
			{ command: "git", args: ["remote", "get-url", "origin"], result: { stdout: "https://example.invalid/repo.git\n" } },
			{ command: "git", args: ["config", "--get-all", "remote.origin.push"], result: { code: 1 } },
			{ command: "git", args: ["config", "--local", "--add", "remote.origin.push", "refs/brmem/*:refs/brmem/*"] },
		]);
		const gateway = new RealGitSetupGateway("/work", commands);

		expect(await gateway.remoteExists("origin")).toEqual({ type: "ok", value: true });
		expect(await gateway.getConfigValues("remote.origin.push")).toEqual({ type: "ok", value: [] });
		expect(await gateway.addConfigValue("remote.origin.push", "refs/brmem/*:refs/brmem/*")).toEqual({ type: "ok", value: undefined });
		expect(commands.calls).toEqual([
			{ command: "git", args: ["remote", "get-url", "origin"], options: { cwd: "/work", env: process.env } },
			{ command: "git", args: ["config", "--get-all", "remote.origin.push"], options: { cwd: "/work", env: process.env } },
			{
				command: "git",
				args: ["config", "--local", "--add", "remote.origin.push", "refs/brmem/*:refs/brmem/*"],
				options: { cwd: "/work", env: process.env },
			},
		]);
	});

	it("reads and writes local Git config in a throwaway repository", async () => {
		const repo = createTempGitRepo();
		try {
			repo.runGit(["remote", "add", "origin", "/tmp/brmem-setup-test-remote.git"]);
			const gateway = new RealGitSetupGateway(repo.path);

			expect(await gateway.remoteExists("origin")).toEqual({ type: "ok", value: true });
			expect(await gateway.getConfigValues("remote.origin.push")).toEqual({ type: "ok", value: [] });
			expect((await gateway.getConfigValues("remote.origin.fetch"))).toMatchObject({
				type: "ok",
				value: ["+refs/heads/*:refs/remotes/origin/*"],
			});

			expect((await gateway.addConfigValue("remote.origin.push", "HEAD")).type).toBe("ok");
			expect((await gateway.addConfigValue("remote.origin.push", "refs/brmem/*:refs/brmem/*")).type).toBe("ok");
			expect((await gateway.addConfigValue("remote.origin.fetch", "refs/brmem/*:refs/brmem/*")).type).toBe("ok");

			expect(repo.runGit(["config", "--get-all", "remote.origin.push"]).trim().split("\n")).toEqual([
				"HEAD",
				"refs/brmem/*:refs/brmem/*",
			]);
			expect(repo.runGit(["config", "--get-all", "remote.origin.fetch"]).trim().split("\n")).toEqual([
				"+refs/heads/*:refs/remotes/origin/*",
				"refs/brmem/*:refs/brmem/*",
			]);
		} finally {
			repo.cleanup();
		}
	});
});

interface CommandStep {
	command: string;
	args: string[];
	result?: Partial<ExecResult> | undefined;
}

interface CommandCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class RecordingCommands implements CommandExecApi {
	readonly calls: CommandCall[] = [];
	private readonly steps: CommandStep[];

	constructor(steps: readonly CommandStep[]) {
		this.steps = [...steps];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args, options });
		const step = this.steps.shift();
		if (step === undefined) throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		expect({ command, args }).toEqual({ command: step.command, args: step.args });
		return execResult(step.result);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}

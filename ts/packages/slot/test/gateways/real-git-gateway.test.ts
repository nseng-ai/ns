import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealSlotGitGateway } from "../../src/gateways/git.ts";

describe("RealSlotGitGateway", () => {
	it("runs git commands through the injected shared command exec API", async () => {
		const execApi = new ScriptedExecApi({ stdout: "/repo\n", stderr: "", code: 0, killed: false });
		const gateway = new RealSlotGitGateway({ cwd: "/repo", env: { PATH: "/fake/bin" }, execApi });

		await expect(gateway.getRepositoryRoot("/repo/subdir")).resolves.toBe("/repo");
		expect(execApi.calls()).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				cwd: "/repo/subdir",
				timeout: 10_000,
			},
		]);
	});
});

interface ExecCall {
	command: string;
	args: readonly string[];
	cwd: string | undefined;
	timeout: number | undefined;
}

class ScriptedExecApi implements CommandExecApi {
	private readonly result: ExecResult;
	private readonly log: ExecCall[] = [];

	constructor(result: ExecResult) {
		this.result = result;
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.log.push({ command, args: [...args], cwd: options.cwd, timeout: options.timeout });
		return { ...this.result };
	}

	calls(): readonly ExecCall[] {
		return this.log.map((call) => ({ ...call, args: [...call.args] }));
	}
}

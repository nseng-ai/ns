import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

import {
	GS_NONINTERACTIVE_ENV,
	RealGsStackProviderGateway,
} from "../../src/core/real-stack-provider-gateway.ts";

interface Call {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: ExecOptions | undefined;
}

describe("real GS stack provider gateway", () => {
	test("uses public argv and the exact noninteractive overlay for every provider call", async () => {
		const commands = new ScriptedExec([
			exited("gh stack version 0.1.0\n"),
			exited(
				JSON.stringify({
					trunk: "main",
					currentBranch: "b",
					branches: [{ name: "b", base: "abc", needsRebase: false, isCurrent: true, additive: 1 }],
				}),
			),
			exited(),
			exited(),
			exited(),
		]);
		const gateway = new RealGsStackProviderGateway(commands, "/repo");

		await expect(gateway.readVersion()).resolves.toEqual({ ok: true, value: "0.1.0" });
		await expect(gateway.readTopology()).resolves.toMatchObject({ ok: true });
		await expect(gateway.startRestack("full")).resolves.toEqual({ ok: true, value: null });
		await expect(gateway.startRestack("downstack")).resolves.toEqual({ ok: true, value: null });
		await expect(gateway.continueRestack()).resolves.toEqual({ ok: true, value: null });

		expect(commands.calls.map((call) => call.args)).toEqual([
			["stack", "--version"],
			["stack", "view", "--json"],
			["stack", "rebase", "--no-trunk"],
			["stack", "rebase", "--no-trunk", "--downstack"],
			["stack", "rebase", "--continue"],
		]);
		for (const call of commands.calls) {
			expect(call.command).toBe("gh");
			expect(call.options).toEqual({ cwd: "/repo", env: GS_NONINTERACTIVE_ENV });
			expect(Object.keys(call.options?.env ?? {}).sort()).toEqual([
				"GH_PROMPT_DISABLED",
				"GIT_EDITOR",
				"GIT_SEQUENCE_EDITOR",
				"GIT_TERMINAL_PROMPT",
			]);
		}
	});

	test("rejects malformed version and topology with bounded protocol evidence", async () => {
		const commands = new ScriptedExec([exited("future\n"), exited("{not json")]);
		const gateway = new RealGsStackProviderGateway(commands, "/repo");
		await expect(gateway.readVersion()).resolves.toMatchObject({
			ok: false,
			error: { termination: "unsupported-output", command: "gh stack --version" },
		});
		await expect(gateway.readTopology()).resolves.toMatchObject({
			ok: false,
			error: { termination: "unsupported-output", command: "gh stack view --json" },
		});
	});
});

class ScriptedExec implements CommandExecApi {
	readonly calls: Call[] = [];
	private readonly results: ExecResult[];

	constructor(results: readonly ExecResult[]) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		return this.results.shift() ?? exited("", 127);
	}
}

function exited(stdout = "", code = 0): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr: "" };
}

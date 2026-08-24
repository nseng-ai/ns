import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

import { GS_RESTACK_COMMAND_ENV, RealGsRestackGateway } from "../../../src/core/index.ts";

class RecordingCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; options: ExecOptions }> = [];
	private readonly results: ExecResult[];

	constructor(results: readonly ExecResult[]) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options: { ...options, env: { ...options.env } } });
		const result = this.results.shift();
		if (result === undefined) throw new Error("Missing command result.");
		return result;
	}
}

describe("real GS restack gateway", () => {
	test("uses only exact public argv and the command environment overlay", async () => {
		const commands = new RecordingCommands([
			exited(0, "gh stack version 0.1.0\n"),
			exited(0),
			exited(0),
			exited(0),
		]);
		const gateway = new RealGsRestackGateway(commands, "/repo");
		expect(await gateway.readVersion()).toEqual({ ok: true, value: "0.1.0" });
		await gateway.start("full");
		await gateway.start("downstack");
		await gateway.continue();
		expect(commands.calls.map(({ command, args }) => [command, ...args])).toEqual([
			["gh", "stack", "--version"],
			["gh", "stack", "rebase", "--no-trunk"],
			["gh", "stack", "rebase", "--no-trunk", "--downstack"],
			["gh", "stack", "rebase", "--continue"],
		]);
		expect(commands.calls.every((call) => call.options.cwd === "/repo")).toBe(true);
		expect(
			commands.calls.every(
				(call) => JSON.stringify(call.options.env) === JSON.stringify(GS_RESTACK_COMMAND_ENV),
			),
		).toBe(true);
	});

	test("rejects malformed version output and bounds diagnostics", async () => {
		const commands = new RecordingCommands([exited(0, `${"x".repeat(2_000)}\n`)]);
		const result = await new RealGsRestackGateway(commands, "/repo").readVersion();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.diagnostic.termination).toBe("unsupported-output");
			expect(result.diagnostic.stdout.length).toBeLessThan(1_100);
		}
	});
});

function exited(code: number, stdout = "", stderr = ""): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr };
}

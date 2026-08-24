import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

import {
	GS_AUTOBRANCH_COMMAND_ENV,
	RealGsAutobranchGitGateway,
	RealGsAutobranchProviderGateway,
} from "../../src/core/real-autobranch-gateways.ts";

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

describe("real GS autobranch provider gateway", () => {
	test("uses exact public command shapes and the noninteractive environment", async () => {
		const commands = new RecordingCommands([
			exited(0, "gh stack version 0.1.0\n"),
			exited(0, JSON.stringify({ trunk: "main", currentBranch: "a", branches: [] })),
			exited(0),
			exited(0),
		]);
		const gateway = new RealGsAutobranchProviderGateway(commands, "/repo");
		expect(await gateway.readVersion()).toEqual({ ok: true, value: "0.1.0" });
		expect(await gateway.view()).toMatchObject({ ok: true });
		await gateway.init("a");
		await gateway.add("b");
		expect(commands.calls.map(({ command, args }) => [command, ...args])).toEqual([
			["gh", "stack", "--version"],
			["gh", "stack", "view", "--json"],
			["gh", "stack", "init", "a"],
			["gh", "stack", "add", "b"],
		]);
		expect(commands.calls.every((call) => call.options.cwd === "/repo")).toBe(true);
		expect(
			commands.calls.every(
				(call) => JSON.stringify(call.options.env) === JSON.stringify(GS_AUTOBRANCH_COMMAND_ENV),
			),
		).toBe(true);
	});

	test("strictly parses version and view output", async () => {
		const commands = new RecordingCommands([
			exited(0, "gh stack 0.1.0\n"),
			exited(0, "{"),
			exited(0, JSON.stringify({ trunk: "main", currentBranch: "a", branches: [{ name: "a" }] })),
		]);
		const gateway = new RealGsAutobranchProviderGateway(commands, "/repo");
		expect(await gateway.readVersion()).toMatchObject({ ok: false });
		expect(await gateway.view()).toEqual({
			ok: false,
			message: "gh stack view --json returned malformed JSON.",
		});
		expect(await gateway.view()).toEqual({
			ok: false,
			message: "gh stack view --json returned an unsupported shape.",
		});
	});

	test("classifies only the exact public missing-stack diagnostic as untracked", async () => {
		const commands = new RecordingCommands([
			exited(2, "", '✗ current branch "peer" is not part of a stack\n'),
			exited(2, "", "database unavailable\n"),
			exited(2, "", "x".repeat(2_000)),
		]);
		const gateway = new RealGsAutobranchProviderGateway(commands, "/repo");
		expect(await gateway.view()).toMatchObject({ ok: false, reason: "untracked" });
		expect(await gateway.view()).toMatchObject({ ok: false, reason: "command-failed" });
		const bounded = await gateway.view();
		expect(bounded.ok).toBe(false);
		if (!bounded.ok) expect(bounded.message.length).toBeLessThanOrEqual(1_100);
	});
});

describe("real GS autobranch Git gateway", () => {
	test("rejects unexpected child-validation command errors", async () => {
		const showRefFailed = new RealGsAutobranchGitGateway(
			new RecordingCommands([exited(0), exited(128, "", "fatal")]),
			"/repo",
		);
		expect(await showRefFailed.validateChild("child")).toMatchObject({
			ok: false,
			reason: "command-failed",
		});
	});

	test("uses exact inspect, child validation, and creation argv", async () => {
		const commands = new RecordingCommands([
			exited(0, "/repo\n"),
			exited(0, "/repo/.git/gh-stack\n"),
			exited(0, "main\n"),
			exited(0, "aaa\n"),
			exited(0, "origin/main\n"),
			exited(0, "?? new.txt\0"),
			exited(0, "diff"),
			exited(0, "aaa\n"),
			exited(0),
			exited(1),
			exited(0),
		]);
		const gateway = new RealGsAutobranchGitGateway(commands, "/repo");
		expect(await gateway.inspect(null)).toMatchObject({
			ok: true,
			value: { branch: "main", trunk: "main", dirty: { untracked: 1, total: 1 } },
		});
		expect(await gateway.validateChild("child")).toEqual({ ok: true, value: true });
		expect(await gateway.createAndSwitchChild("child")).toEqual({ ok: true, value: null });
		expect(commands.calls.map(({ args }) => args)).toContainEqual(["switch", "-c", "child"]);
	});
});

function exited(code: number, stdout = "", stderr = ""): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr };
}

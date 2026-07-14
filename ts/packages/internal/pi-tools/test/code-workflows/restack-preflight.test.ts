import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";

import { createCommandRestackPreflight } from "../../src/code-workflows/restack-preflight.ts";

interface CommandCall {
	command: string;
	args: string[];
	cwd?: string;
}

class FakeCommands implements CommandExecApi {
	readonly calls: CommandCall[] = [];
	private readonly result: ExecResult;

	constructor(result: ExecResult) {
		this.result = result;
	}

	async exec(command: string, args: string[], options: { cwd?: string } = {}): Promise<ExecResult> {
		this.calls.push(
			options.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
		);
		return this.result;
	}
}

function exited(options: { code?: number; stdout?: string; stderr?: string } = {}): ExecResult {
	return {
		type: "exited",
		code: options.code ?? 0,
		stdout: options.stdout ?? "",
		stderr: options.stderr ?? "",
		signal: null,
	};
}

function data(
	overrides: Partial<{
		clean: boolean;
		tracked: boolean;
		rebaseInProgress: boolean;
		hasUpstackChildren: boolean;
		requestedScope: "downstack" | "full";
		effectiveScope: "downstack" | "full";
		branches: string[];
		slotConflicts: Array<{
			type: "checked-out-elsewhere";
			branch: string;
			worktreePath: string;
		}>;
		warnings: string[];
	}> = {},
) {
	return {
		clean: true,
		tracked: true,
		rebaseInProgress: false,
		hasUpstackChildren: true,
		requestedScope: "full" as const,
		effectiveScope: "full" as const,
		branches: ["feature/current"],
		slotConflicts: [],
		warnings: [],
		...overrides,
	};
}

function envelope(value: unknown, code = 0): ExecResult {
	return exited({ code, stdout: JSON.stringify(value) });
}

function setup(result: ExecResult) {
	const commands = new FakeCommands(result);
	return { commands, run: createCommandRestackPreflight({ commands }) };
}

describe("command-backed smart-restack preflight", () => {
	test("maps a valid ok envelope to ready and invokes the full-scope command exactly", async () => {
		const setupResult = setup(
			envelope({
				status: "ok",
				exitCode: 0,
				data: { ...data(), additiveFutureField: true },
				additiveEnvelopeField: "accepted",
			}),
		);

		await expect(setupResult.run({ cwd: "/repo/nested" })).resolves.toEqual({ type: "ready" });
		expect(setupResult.commands.calls).toEqual([
			{
				command: "ns",
				args: ["slot", "gt", "exec", "restack-preflight", "--scope", "full", "--format", "json"],
				cwd: "/repo/nested",
			},
		]);
	});

	test.each([
		["dirty worktree", data({ clean: false }), "uncommitted changes"],
		["untracked branch", data({ tracked: false }), "not tracked by Graphite"],
		[
			"Slot conflict",
			data({
				slotConflicts: [
					{
						type: "checked-out-elsewhere",
						branch: "feature/a",
						worktreePath: "/slots/slot-03",
					},
				],
			}),
			"1 Slot conflict",
		],
	] as const)("refuses a negative envelope for %s", async (_label, facts, expectedMessage) => {
		const setupResult = setup(
			envelope(
				{
					status: "negative",
					exitCode: 1,
					message: "Restack preflight is blocked.",
					data: facts,
				},
				1,
			),
		);

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain(expectedMessage);
	});

	test.each([
		["ok", 0],
		["negative", 1],
	] as const)("maps rebaseInProgress from a %s envelope", async (status, code) => {
		const value =
			status === "ok"
				? { status, exitCode: code, data: data({ rebaseInProgress: true }) }
				: {
						status,
						exitCode: code,
						message: "Restack preflight is blocked.",
						data: data({ rebaseInProgress: true }),
					};
		const setupResult = setup(envelope(value, code));

		await expect(setupResult.run({ cwd: "/repo" })).resolves.toEqual({
			type: "rebase-in-progress",
		});
	});

	test("maps rebaseInProgress data even when a failure envelope carries the facts", async () => {
		const setupResult = setup(
			envelope(
				{
					status: "failure",
					exitCode: 2,
					errorType: "inspection-failed",
					message: "inspection stopped during a rebase",
					data: data({ rebaseInProgress: true }),
				},
				2,
			),
		);

		await expect(setupResult.run({ cwd: "/repo" })).resolves.toEqual({
			type: "rebase-in-progress",
		});
	});

	test("refuses a command execution failure", async () => {
		const setupResult = setup({
			type: "spawn-failed",
			stdout: "",
			stderr: "ns: command not found",
			error: "ns: command not found",
		});

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain(
			"Cannot run ns restack preflight",
		);
	});

	test.each([
		[
			"failure",
			{ status: "failure", exitCode: 2, errorType: "backend-failed", message: "gt failed" },
		],
		["usage", { status: "usageError", exitCode: 2, errorType: "usageError", message: "bad scope" }],
	] as const)("refuses a valid %s envelope with its diagnostic", async (_label, value) => {
		const setupResult = setup(envelope(value, 2));

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain(value.message);
	});

	test("refuses a nonzero process result whose envelope reports success", async () => {
		const setupResult = setup(envelope({ status: "ok", exitCode: 0, data: data() }, 1));

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain("process exited with code 1");
	});

	test("refuses malformed JSON", async () => {
		const setupResult = setup(exited({ stdout: "{not json" }));

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain("malformed JSON");
	});

	test.each([
		["missing stable data", { status: "ok", exitCode: 0, data: { clean: true } }],
		[
			"wrong envelope exit code",
			{ status: "negative", exitCode: 0, message: "blocked", data: data() },
		],
	] as const)("refuses schema-invalid JSON: %s", async (_label, value) => {
		const setupResult = setup(envelope(value));

		const result = await setupResult.run({ cwd: "/repo" });

		expect(result.type).toBe("refused");
		expect(result.type === "refused" ? result.message : "").toContain("invalid result");
	});
});

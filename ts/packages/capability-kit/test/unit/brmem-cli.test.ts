import { describe, expect, test } from "vitest";

import {
	DEFAULT_BRMEM_TIMEOUT_MS,
	brmemCommandFailure,
	checkBrmemEntry,
	formatBrmemUnavailableMessage,
	listBrmemEntries,
	parseBrmemListEntries,
	parseBrmemPutData,
	putBrmemEntryFromFile,
	runAvailableBrmemCommand,
	runBrmem,
	type BrmemExecGateway,
} from "@ji/capability-kit/brmem-cli";
import type { PiExecResultLike } from "@ji/core/command";
import { ScriptedQueue } from "@ji/core/test-kit";

const ROOT = "/repo";

type ExecOptions = Parameters<BrmemExecGateway["exec"]>[2];

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions;
}

type ScriptedExec =
	| { command: string; args: string[]; result: PiExecResultLike }
	| { command: string; args: string[]; error: Error };

class FakeGateway implements BrmemExecGateway {
	readonly calls: ExecCall[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[]) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<PiExecResultLike> {
		this.calls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return { code: 99, stderr: missingStepMessage };
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return { code: 99, stderr: message };
		}
		if ("error" in expected) throw expected.error;
		return expected.result;
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function step(
	command: string,
	args: string[],
	result: PiExecResultLike = { code: 0 },
): ScriptedExec {
	return { command, args, result };
}

function errorStep(command: string, args: string[], error: Error): ScriptedExec {
	return { command, args, error };
}

function envelope(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ exitCode: 0, data, ...overrides });
}

describe("runBrmem", () => {
	test("returns the completed PATH brmem run on success", async () => {
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 0, stdout: "{}" }),
		]);

		const run = await runBrmem({
			gateway,
			cwd: ROOT,
			brmemArgs: ["list", "--format", "json"],
			timeoutMs: 1000,
		});

		gateway.assertDone();
		expect(run.type).toBe("completed");
		if (run.type !== "completed") throw new Error(`expected completed run, got ${run.type}`);
		expect(run.command).toBe("brmem");
		expect(run.result.stdout).toBe("{}");
	});

	test("falls back to the TS workspace brmem command after PATH brmem is unavailable", async () => {
		const workspaceRoot = process.cwd();
		const gateway = new FakeGateway([
			step("brmem", ["list"], { code: 127, stderr: "brmem: command not found" }),
			step(
				"pnpm",
				["--config.verify-deps-before-run=false", "--dir", workspaceRoot, "exec", "brmem", "list"],
				{ code: 0, stdout: "{}" },
			),
		]);

		const run = await runBrmem({
			gateway,
			cwd: workspaceRoot,
			brmemArgs: ["list"],
			timeoutMs: 1000,
		});

		gateway.assertDone();
		expect(run.type).toBe("completed");
		if (run.type !== "completed") throw new Error(`expected completed run, got ${run.type}`);
		expect(run.command).toBe("pnpm");
		expect(run.result.stdout).toBe("{}");
	});

	test("returns unavailable with plural failures when every candidate is unavailable", async () => {
		const workspaceRoot = process.cwd();
		const gateway = new FakeGateway([
			step("brmem", ["list"], { code: 127, stderr: "brmem: command not found" }),
			step(
				"pnpm",
				["--config.verify-deps-before-run=false", "--dir", workspaceRoot, "exec", "brmem", "list"],
				{ code: 127, stderr: "brmem: command not found" },
			),
		]);

		const run = await runBrmem({
			gateway,
			cwd: workspaceRoot,
			brmemArgs: ["list"],
			timeoutMs: 1000,
		});

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(2);
		const message = formatBrmemUnavailableMessage(run.failures);
		expect(message).toContain("No brmem command available");
		expect(message).toContain("just install-brmem");
		expect(message).toContain("just install-tools");
		expect(message).not.toContain("uv run");
	});

	test("returns unavailable after a PATH brmem startup failure", async () => {
		const gateway = new FakeGateway([
			errorStep("brmem", ["list", "--format", "json"], new Error("spawn ENOENT")),
		]);

		const run = await runBrmem({
			gateway,
			cwd: ROOT,
			brmemArgs: ["list", "--format", "json"],
			timeoutMs: 1000,
		});

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(1);
		expect(run.failures[0]?.displayCommand).toBe("brmem list --format json");
		expect(run.failures[0]?.failure).toContain("brmem command (failed before completion)");
		expect(run.failures[0]?.failure).toContain("spawn ENOENT");
	});
});

describe("runAvailableBrmemCommand", () => {
	test("returns a completed run with the default timeout and signal", async () => {
		const signal = new AbortController().signal;
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 0, stdout: "{}" }),
		]);

		const run = await runAvailableBrmemCommand({
			gateway,
			cwd: ROOT,
			brmemArgs: ["list", "--format", "json"],
			signal,
		});

		gateway.assertDone();
		expect(run.ok).toBe(true);
		if (!run.ok) throw new Error(`expected successful run: ${run.error.message}`);
		expect(run.value.result).toMatchObject({ code: 0, stdout: "{}" });
		expect(gateway.calls[0]?.options).toEqual({
			cwd: ROOT,
			timeout: DEFAULT_BRMEM_TIMEOUT_MS,
			signal,
		});
	});

	test("treats a semantic PATH brmem nonzero result as an available command", async () => {
		const gateway = new FakeGateway([step("brmem", ["check", "plan.md"], { code: 1 })]);

		const run = await runAvailableBrmemCommand({
			gateway,
			cwd: ROOT,
			brmemArgs: ["check", "plan.md"],
			timeoutMs: 5678,
		});

		gateway.assertDone();
		expect(run.ok).toBe(true);
		if (!run.ok) throw new Error(`expected successful run: ${run.error.message}`);
		expect(run.value.command).toBe("brmem");
		expect(run.value.result.code).toBe(1);
		expect(gateway.calls.map((call) => call.options?.timeout)).toEqual([5678]);
	});

	test("returns a structured unavailable error when PATH brmem is unavailable", async () => {
		const gateway = new FakeGateway([
			step("brmem", ["list"], { code: 127, stderr: "brmem: command not found" }),
		]);

		const run = await runAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["list"] });

		gateway.assertDone();
		expect(run).toMatchObject({ ok: false, error: { code: "brmem_unavailable" } });
		if (run.ok) throw new Error("expected unavailable result");
		expect(run.error.message).toContain("just install-brmem");
		expect(run.error.message).toContain("Command: brmem list");
		expect(run.error.message).not.toContain("uv run");
	});
});

describe("checkBrmemEntry", () => {
	const locator = { namespace: "branch-context", key: "plan.md", branch: "feature/demo" };
	const checkArgs = [
		"check",
		"plan.md",
		"--namespace",
		"branch-context",
		"--branch",
		"feature/demo",
		"--format",
		"json",
	];

	test("returns present with the exact command protocol, default timeout, and signal", async () => {
		const signal = new AbortController().signal;
		const gateway = new FakeGateway([
			step("brmem", checkArgs, { code: 0, stdout: envelope({ present: true }) }),
		]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator, signal });

		gateway.assertDone();
		expect(result).toEqual({
			type: "present",
			displayCommand:
				"brmem check plan.md --namespace branch-context --branch feature/demo --format json",
		});
		expect(gateway.calls[0]?.options).toEqual({
			cwd: ROOT,
			timeout: DEFAULT_BRMEM_TIMEOUT_MS,
			signal,
		});
	});

	test("returns absent for present false check output", async () => {
		const gateway = new FakeGateway([
			step("brmem", checkArgs, { code: 0, stdout: envelope({ present: false }) }),
		]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toEqual({ type: "absent" });
	});

	test("returns error for nonzero brmem check process code", async () => {
		const gateway = new FakeGateway([step("brmem", checkArgs, { code: 1 })]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toMatchObject({ type: "error", error: { code: "brmem_check_failed" } });
	});

	test("returns malformed error when check output omits required present flag", async () => {
		const gateway = new FakeGateway([step("brmem", checkArgs, { code: 0, stdout: envelope({}) })]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toMatchObject({ type: "error", error: { code: "brmem_malformed_check" } });
	});

	test("returns malformed error when check present flag is non-boolean", async () => {
		const gateway = new FakeGateway([
			step("brmem", checkArgs, { code: 0, stdout: envelope({ present: "no" }) }),
		]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toMatchObject({ type: "error", error: { code: "brmem_malformed_check" } });
	});

	test("maps check failures", async () => {
		const killed = new FakeGateway([
			step("brmem", checkArgs, { code: 124, killed: true, stderr: "timeout" }),
		]);
		expect(await checkBrmemEntry({ gateway: killed, cwd: ROOT, ...locator })).toMatchObject({
			type: "error",
			error: { code: "brmem_check_killed" },
		});
		killed.assertDone();

		const nonzero = new FakeGateway([step("brmem", checkArgs, { code: 2, stderr: "bad args" })]);
		expect(await checkBrmemEntry({ gateway: nonzero, cwd: ROOT, ...locator })).toMatchObject({
			type: "error",
			error: { code: "brmem_check_failed" },
		});
		nonzero.assertDone();

		const unavailable = new FakeGateway([
			step("brmem", checkArgs, { code: 127, stderr: "brmem: command not found" }),
		]);
		expect(await checkBrmemEntry({ gateway: unavailable, cwd: ROOT, ...locator })).toMatchObject({
			type: "error",
			error: { code: "brmem_unavailable" },
		});
		unavailable.assertDone();
	});
});

describe("putBrmemEntryFromFile", () => {
	const locator = { namespace: "ccc-dispatch", key: "prompt.md", branch: "feature/demo" };
	const sourceFile = "/tmp/prompt.md";
	const putArgs = [
		"put",
		"prompt.md",
		"--namespace",
		"ccc-dispatch",
		"--branch",
		"feature/demo",
		"--file",
		"/tmp/prompt.md",
		"--format",
		"json",
	];
	const validData = {
		namespace: "ccc-dispatch",
		key: "prompt.md",
		branch: "feature/demo",
		refName: "refs/brmem/ns/ccc-dispatch/feature---demo:prompt.md",
		commit: "0123456789abcdef",
		sourceFile: sourceFile,
	} satisfies Record<string, unknown>;

	test("stores a file with the exact command protocol and validates the response", async () => {
		const gateway = new FakeGateway([
			step("brmem", putArgs, { code: 0, stdout: envelope(validData) }),
		]);

		const result = await putBrmemEntryFromFile({ gateway, cwd: ROOT, ...locator, sourceFile });

		gateway.assertDone();
		expect(result).toEqual({
			ok: true,
			value: {
				namespace: "ccc-dispatch",
				key: "prompt.md",
				branch: "feature/demo",
				refName: "refs/brmem/ns/ccc-dispatch/feature---demo:prompt.md",
				commit: "0123456789abcdef",
				sourceFile,
			},
		});
		expect(gateway.calls[0]?.options).toEqual({ cwd: ROOT, timeout: DEFAULT_BRMEM_TIMEOUT_MS });
	});

	test("omits --branch when no branch is requested", async () => {
		const args = [
			"put",
			"prompt.md",
			"--namespace",
			"ccc-dispatch",
			"--file",
			"/tmp/prompt.md",
			"--format",
			"json",
		];
		const gateway = new FakeGateway([
			step("brmem", args, { code: 0, stdout: envelope(validData) }),
		]);

		const result = await putBrmemEntryFromFile({
			gateway,
			cwd: ROOT,
			namespace: "ccc-dispatch",
			key: "prompt.md",
			sourceFile,
		});

		gateway.assertDone();
		expect(result).toMatchObject({ ok: true });
	});

	test("maps put command failures", async () => {
		const killed = new FakeGateway([
			step("brmem", putArgs, { code: 124, killed: true, stderr: "timeout" }),
		]);
		expect(
			await putBrmemEntryFromFile({ gateway: killed, cwd: ROOT, ...locator, sourceFile }),
		).toMatchObject({
			ok: false,
			error: { code: "brmem_put_failed" },
		});
		killed.assertDone();

		const nonzero = new FakeGateway([step("brmem", putArgs, { code: 2, stderr: "bad args" })]);
		expect(
			await putBrmemEntryFromFile({ gateway: nonzero, cwd: ROOT, ...locator, sourceFile }),
		).toMatchObject({
			ok: false,
			error: { code: "brmem_put_failed" },
		});
		nonzero.assertDone();

		const unavailable = new FakeGateway([
			step("brmem", putArgs, { code: 127, stderr: "brmem: command not found" }),
		]);
		expect(
			await putBrmemEntryFromFile({ gateway: unavailable, cwd: ROOT, ...locator, sourceFile }),
		).toMatchObject({
			ok: false,
			error: { code: "brmem_unavailable" },
		});
		unavailable.assertDone();
	});

	test("returns malformed output errors with display command evidence", async () => {
		const malformed = new FakeGateway([step("brmem", putArgs, { code: 0, stdout: "{" })]);
		const result = await putBrmemEntryFromFile({
			gateway: malformed,
			cwd: ROOT,
			...locator,
			sourceFile,
		});

		malformed.assertDone();
		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "brmem_malformed_put",
				displayCommand:
					"brmem put prompt.md --namespace ccc-dispatch --branch feature/demo --file /tmp/prompt.md --format json",
			},
		});
	});

	test("returns unexpected put data errors for mismatched response fields", async () => {
		const cases = [
			{
				field: "namespace",
				data: { ...validData, namespace: "other" },
				message: 'namespace "other" != "ccc-dispatch"',
			},
			{
				field: "key",
				data: { ...validData, key: "other.md" },
				message: 'key "other.md" != "prompt.md"',
			},
			{
				field: "branch",
				data: { ...validData, branch: "other" },
				message: 'branch "other" != "feature/demo"',
			},
			{
				field: "sourceFile",
				data: { ...validData, sourceFile: "/tmp/other.md" },
				message: 'sourceFile "/tmp/other.md" != "/tmp/prompt.md"',
			},
		];

		for (const testCase of cases) {
			const mismatched = new FakeGateway([
				step("brmem", putArgs, { code: 0, stdout: envelope(testCase.data) }),
			]);
			const result = await putBrmemEntryFromFile({
				gateway: mismatched,
				cwd: ROOT,
				...locator,
				sourceFile,
			});

			mismatched.assertDone();
			expect(result).toMatchObject({
				ok: false,
				error: {
					code: "brmem_unexpected_put_data",
					displayCommand:
						"brmem put prompt.md --namespace ccc-dispatch --branch feature/demo --file /tmp/prompt.md --format json",
				},
			});
			if (result.ok) throw new Error(`expected mismatch failure for ${testCase.field}`);
			expect(result.error.message).toContain(testCase.message);
		}
	});
});

describe("parseBrmemListEntries", () => {
	const validData = {
		entries: [
			{
				namespace: "roaster",
				key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
				branch: "feature/demo",
				refName:
					"refs/brmem/ns/roaster/feature---demo:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
			},
		],
	} satisfies Record<string, unknown>;

	test("parses list entries to camelCase fields", () => {
		expect(parseBrmemListEntries(envelope(validData), { namespace: "roaster" })).toEqual([
			{
				namespace: "roaster",
				key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
				branch: "feature/demo",
				refName:
					"refs/brmem/ns/roaster/feature---demo:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
			},
		]);
	});

	test("throws for malformed list envelopes and entries", () => {
		expect(() => parseBrmemListEntries("{")).toThrow(/Malformed brmem list JSON/);
		expect(() => parseBrmemListEntries(envelope({}))).toThrow(/expected data.entries array/);
		expect(() => parseBrmemListEntries(envelope({ entries: [null] }))).toThrow(
			/expected data.entries\[0\] object/,
		);
		expect(() =>
			parseBrmemListEntries(envelope({ entries: [{ ...validData.entries[0], key: 123 }] })),
		).toThrow(/expected string fields/);
	});

	test("throws when expected namespace or branch does not match", () => {
		expect(() =>
			parseBrmemListEntries(envelope(validData), { namespace: "branch-context" }),
		).toThrow(/namespace "roaster" != "branch-context"/);
		expect(() => parseBrmemListEntries(envelope(validData), { branch: "other" })).toThrow(
			/branch "feature\/demo" != "other"/,
		);
	});
});

describe("listBrmemEntries", () => {
	const listArgs = ["list", "--namespace", "roaster", "--format", "json"];
	const validData = {
		entries: [
			{
				namespace: "roaster",
				key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
				branch: "feature/demo",
				refName:
					"refs/brmem/ns/roaster/feature---demo:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
			},
		],
	} satisfies Record<string, unknown>;

	test("runs brmem list and parses entries", async () => {
		const signal = new AbortController().signal;
		const gateway = new FakeGateway([
			step("brmem", listArgs, { code: 0, stdout: envelope(validData) }),
		]);

		const result = await listBrmemEntries({
			gateway,
			cwd: ROOT,
			namespace: "roaster",
			signal,
		});

		gateway.assertDone();
		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error(`expected successful list: ${result.error.message}`);
		expect(result.value[0]?.refName).toBe(
			"refs/brmem/ns/roaster/feature---demo:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
		);
		expect(gateway.calls[0]?.options).toEqual({
			cwd: ROOT,
			timeout: DEFAULT_BRMEM_TIMEOUT_MS,
			signal,
		});
	});

	test("passes optional branch and env arguments", async () => {
		const env = { PATH: "/bin" };
		const gateway = new FakeGateway([
			step(
				"brmem",
				["list", "--namespace", "roaster", "--branch", "feature/demo", "--format", "json"],
				{ code: 0, stdout: envelope(validData) },
			),
		]);

		const result = await listBrmemEntries({
			gateway,
			cwd: ROOT,
			namespace: "roaster",
			branch: "feature/demo",
			env,
		});

		gateway.assertDone();
		expect(result).toMatchObject({ ok: true });
		expect(gateway.calls[0]?.options).toEqual({
			cwd: ROOT,
			timeout: DEFAULT_BRMEM_TIMEOUT_MS,
			env,
		});
	});

	test("maps list command failures", async () => {
		const nonzero = new FakeGateway([step("brmem", listArgs, { code: 2, stderr: "bad args" })]);
		expect(
			await listBrmemEntries({ gateway: nonzero, cwd: ROOT, namespace: "roaster" }),
		).toMatchObject({
			ok: false,
			error: { code: "brmem_list_failed" },
		});
		nonzero.assertDone();

		const unavailable = new FakeGateway([
			step("brmem", listArgs, { code: 127, stderr: "brmem: command not found" }),
		]);
		expect(
			await listBrmemEntries({ gateway: unavailable, cwd: ROOT, namespace: "roaster" }),
		).toMatchObject({
			ok: false,
			error: { code: "brmem_unavailable" },
		});
		unavailable.assertDone();
	});

	test("maps malformed list output", async () => {
		const gateway = new FakeGateway([step("brmem", listArgs, { code: 0, stdout: "{" })]);

		const result = await listBrmemEntries({ gateway, cwd: ROOT, namespace: "roaster" });

		gateway.assertDone();
		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "brmem_malformed_list",
				displayCommand: "brmem list --namespace roaster --format json",
			},
		});
	});
});

describe("brmemCommandFailure", () => {
	test("formats command output and preserves the display command", () => {
		const error = brmemCommandFailure("brmem_put_failed", "brmem put failed", {
			type: "completed",
			command: "brmem",
			args: ["put", "plan.md"],
			displayCommand: "brmem put plan.md",
			result: { code: 2, killed: false, stdout: "out", stderr: "err" },
		});

		expect(error.code).toBe("brmem_put_failed");
		expect(error.displayCommand).toBe("brmem put plan.md");
		expect(error.message).toContain("brmem put failed (exit code 2)");
		expect(error.message).toContain("Command: brmem put plan.md");
		expect(error.message).toContain("out");
		expect(error.message).toContain("err");
	});

	test("surfaces brmem machine-envelope status text", () => {
		const error = brmemCommandFailure("brmem_put_failed", "brmem put failed", {
			type: "completed",
			command: "brmem",
			args: ["put", "plan.md"],
			displayCommand: "brmem put plan.md",
			result: {
				code: 1,
				killed: false,
				stdout: JSON.stringify({ exitCode: 1, message: "Source file is too large" }),
				stderr: "",
			},
		});

		expect(error.message).toContain("brmem put failed: Source file is too large");
		expect(error.message).toContain("Command: brmem put plan.md");
	});
});

describe("parseBrmemPutData", () => {
	const validData = {
		namespace: "branch-context",
		key: "plan.md",
		branch: "feature/demo",
		refName: "refs/brmem/ns/branch-context/feature---demo:plan.md",
		commit: "0123456789abcdef",
		sourceFile: "/tmp/plan.md",
	} satisfies Record<string, unknown>;

	test("parses a successful brmem put machine envelope", () => {
		expect(parseBrmemPutData(envelope(validData))).toEqual({
			namespace: "branch-context",
			key: "plan.md",
			branch: "feature/demo",
			refName: "refs/brmem/ns/branch-context/feature---demo:plan.md",
			commit: "0123456789abcdef",
			sourceFile: "/tmp/plan.md",
		});
	});

	test("throws for malformed envelopes", () => {
		expect(() => parseBrmemPutData("{")).toThrow(/Malformed brmem put JSON: invalid JSON/);
		expect(() =>
			parseBrmemPutData(envelope(validData, { exitCode: 2, message: "failed" })),
		).toThrow(/exitCode 2: failed/);
		expect(() => parseBrmemPutData(JSON.stringify({ exitCode: 0 }))).toThrow(
			/expected a data object/,
		);
	});

	test("throws for missing or non-string data fields", () => {
		expect(() => parseBrmemPutData(envelope({ ...validData, namespace: 123 }))).toThrow(
			/expected string fields/,
		);
		expect(() => parseBrmemPutData(envelope({ ...validData, sourceFile: undefined }))).toThrow(
			/expected string fields/,
		);
	});

	test("includes a bounded stdout tail in malformed-output messages", () => {
		const longStdout = JSON.stringify({
			exitCode: 0,
			data: { ...validData, sourceFile: 123 },
			padding: "x".repeat(5_000),
		});

		let message = "";
		try {
			parseBrmemPutData(longStdout);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toContain("stdout tail:");
		expect(message).toContain("…");
		expect(message.length).toBeLessThan(longStdout.length);
	});
});

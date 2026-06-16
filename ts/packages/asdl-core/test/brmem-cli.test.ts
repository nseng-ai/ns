import { describe, expect, test } from "vitest";

import {
	DEFAULT_BRMEM_TIMEOUT_MS,
	brmemCommandFailure,
	checkBrmemEntry,
	formatBrmemUnavailableMessage,
	parseBrmemPutData,
	putBrmemEntryFromFile,
	resolveBrmemCommandCandidates,
	runAvailableBrmemCommand,
	runBrmemCandidate,
	runFirstAvailableBrmemCommand,
	type BrmemCommandCandidate,
	type BrmemExecGateway,
} from "@asdl/core/brmem-cli";
import type { PiExecResultLike } from "@asdl/core/exec";

const ROOT = "/repo";

type ExecOptions = Parameters<BrmemExecGateway["exec"]>[2];

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: PiExecResultLike;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

class FakeGateway implements BrmemExecGateway {
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<PiExecResultLike> {
		this.calls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return { code: 99, stderr: message };
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return { code: 99, stderr: message };
		}

		if ("error" in expected) throw expected.error;
		return expected.result;
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fakeExists(paths: string[]): (path: string) => boolean {
	const existing = new Set(paths);
	return (path) => existing.has(path);
}

function step(command: string, args: string[], result: PiExecResultLike = { code: 0 }): ScriptedExec {
	return { command, args, result };
}

function errorStep(command: string, args: string[], error: Error): ScriptedExec {
	return { command, args, error };
}

function envelope(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ exit_code: 0, data, ...overrides });
}

describe("resolveBrmemCommandCandidates", () => {
	test("returns only PATH brmem", () => {
		expect(resolveBrmemCommandCandidates("/repo/pkg", { exists: fakeExists([]) })).toEqual([{ command: "brmem", prefixArgs: [] }]);
	});

	test("ignores old Python venv and uv fallback locations", () => {
		expect(
			resolveBrmemCommandCandidates("/repo/pkg/app", {
				exists: fakeExists([
					"/repo/.venv/bin/brmem",
					"/repo/pkg/.venv/bin/brmem",
					"/repo/pyproject.toml",
					"/repo/pkg/pyproject.toml",
				]),
			}),
		).toEqual([{ command: "brmem", prefixArgs: [] }]);
	});
});

describe("runBrmemCandidate", () => {
	test("prepends prefix args, formats display command, and passes execution options", async () => {
		const signal = new AbortController().signal;
		const candidate: BrmemCommandCandidate = {
			command: "brmem-wrapper",
			prefixArgs: ["--root", "/repo with space", "--"],
		};
		const gateway = new FakeGateway([
			step("brmem-wrapper", ["--root", "/repo with space", "--", "put", "plans/key.md", "--file", "/tmp/plan with space.md"], {
				code: 0,
				stdout: "ok",
			}),
		]);

		const run = await runBrmemCandidate({
			gateway,
			cwd: ROOT,
			candidate,
			brmemArgs: ["put", "plans/key.md", "--file", "/tmp/plan with space.md"],
			timeoutMs: 1234,
			signal,
		});

		gateway.assertDone();
		expect(run.type).toBe("completed");
		expect(run.args).toEqual(["--root", "/repo with space", "--", "put", "plans/key.md", "--file", "/tmp/plan with space.md"]);
		expect(run.displayCommand).toBe("brmem-wrapper --root '/repo with space' -- put plans/key.md --file '/tmp/plan with space.md'");
		expect(gateway.calls[0]?.options).toEqual({ cwd: ROOT, timeout: 1234, signal });
		if (run.type === "completed") {
			expect(run.result).toEqual({ code: 0, stdout: "ok", stderr: "", killed: false });
		}
	});

	test("returns unavailable when startup throws", async () => {
		const candidate = { command: "brmem", prefixArgs: [] };
		const gateway = new FakeGateway([errorStep("brmem", ["list"], new Error("spawn ENOENT"))]);

		const run = await runBrmemCandidate({ gateway, cwd: ROOT, candidate, brmemArgs: ["list"], timeoutMs: 1000 });

		gateway.assertDone();
		if (run.type !== "unavailable") {
			throw new Error(`expected unavailable run, got ${run.type}`);
		}
		expect(run.failure).toContain("brmem command (failed before completion)");
		expect(run.failure).toContain("spawn ENOENT");
	});

	test("preserves semantic nonzero and killed results as completed runs", async () => {
		for (const result of [{ code: 1, stderr: "absent" }, { code: 2, stderr: "invalid" }, { code: 127, killed: true, stderr: "command not found" }]) {
			const candidate = { command: "brmem", prefixArgs: [] };
			const gateway = new FakeGateway([step("brmem", ["check", "plan.md"], result)]);

			const run = await runBrmemCandidate({ gateway, cwd: ROOT, candidate, brmemArgs: ["check", "plan.md"], timeoutMs: 1000 });

			gateway.assertDone();
			expect(run.type).toBe("completed");
			if (run.type === "completed") expect(run.result.code).toBe(result.code);
		}
	});
});

describe("runFirstAvailableBrmemCommand", () => {
	test("returns unavailable after a PATH brmem startup failure", async () => {
		const gateway = new FakeGateway([errorStep("brmem", ["list", "--format", "json"], new Error("spawn ENOENT"))]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(1);
		expect(run.failures[0]?.displayCommand).toBe("brmem list --format json");
	});

	test("returns unavailable after a PATH brmem command-not-found result", async () => {
		const gateway = new FakeGateway([step("brmem", ["list", "--format", "json"], { code: 127, stderr: "brmem: command not found" })]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(1);
		const message = formatBrmemUnavailableMessage(run.failures);
		expect(message).toContain("No brmem command available");
		expect(message).toContain("just install-brmem");
		expect(message).toContain("just install-tools");
		expect(message).toContain("Command: brmem list --format json");
		expect(message).not.toContain("uv run");
	});

	test("returns unavailable after an explicit startupError result", async () => {
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 127, stderr: "spawn brmem ENOENT", startupError: "spawn brmem ENOENT" }),
		]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(1);
	});
});

describe("runAvailableBrmemCommand", () => {
	test("returns a completed run with the default timeout and signal", async () => {
		const signal = new AbortController().signal;
		const gateway = new FakeGateway([step("brmem", ["list", "--format", "json"], { code: 0, stdout: "{}" })]);

		const run = await runAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["list", "--format", "json"], signal });

		gateway.assertDone();
		expect(run.ok).toBe(true);
		if (!run.ok) throw new Error(`expected successful run: ${run.error.message}`);
		expect(run.value.result).toMatchObject({ code: 0, stdout: "{}" });
		expect(gateway.calls[0]?.options).toEqual({ cwd: ROOT, timeout: DEFAULT_BRMEM_TIMEOUT_MS, signal });
	});

	test("treats a semantic PATH brmem nonzero result as an available command", async () => {
		const gateway = new FakeGateway([step("brmem", ["check", "plan.md"], { code: 1 })]);

		const run = await runAvailableBrmemCommand({ gateway, cwd: ROOT, brmemArgs: ["check", "plan.md"], timeoutMs: 5678 });

		gateway.assertDone();
		expect(run.ok).toBe(true);
		if (!run.ok) throw new Error(`expected successful run: ${run.error.message}`);
		expect(run.value.command).toBe("brmem");
		expect(run.value.result.code).toBe(1);
		expect(gateway.calls.map((call) => call.options?.timeout)).toEqual([5678]);
	});

	test("returns a structured unavailable error when PATH brmem is unavailable", async () => {
		const gateway = new FakeGateway([step("brmem", ["list"], { code: 127, stderr: "brmem: command not found" })]);

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
	const checkArgs = ["check", "plan.md", "--namespace", "branch-context", "--branch", "feature/demo", "--format", "json"];

	test("returns present with the exact command protocol, default timeout, and signal", async () => {
		const signal = new AbortController().signal;
		const gateway = new FakeGateway([step("brmem", checkArgs, { code: 0, stdout: envelope({ present: true }) })]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator, signal });

		gateway.assertDone();
		expect(result).toEqual({ type: "present", displayCommand: "brmem check plan.md --namespace branch-context --branch feature/demo --format json" });
		expect(gateway.calls[0]?.options).toEqual({ cwd: ROOT, timeout: DEFAULT_BRMEM_TIMEOUT_MS, signal });
	});

	test("returns absent for present false check output", async () => {
		const gateway = new FakeGateway([step("brmem", checkArgs, { code: 0, stdout: envelope({ present: false }) })]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toEqual({ type: "absent" });
	});

	test("returns absent for legacy exit code 1", async () => {
		const gateway = new FakeGateway([step("brmem", checkArgs, { code: 1 })]);

		const result = await checkBrmemEntry({ gateway, cwd: ROOT, ...locator });

		gateway.assertDone();
		expect(result).toEqual({ type: "absent" });
	});

	test("maps check failures", async () => {
		const killed = new FakeGateway([step("brmem", checkArgs, { code: 124, killed: true, stderr: "timeout" })]);
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

		const unavailable = new FakeGateway([step("brmem", checkArgs, { code: 127, stderr: "brmem: command not found" })]);
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
		ref_name: "refs/brmem/ns/ccc-dispatch/feature---demo:prompt.md",
		commit: "0123456789abcdef",
		source_file: sourceFile,
	} satisfies Record<string, unknown>;

	test("stores a file with the exact command protocol and validates the response", async () => {
		const gateway = new FakeGateway([step("brmem", putArgs, { code: 0, stdout: envelope(validData) })]);

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

	test("maps put command failures", async () => {
		const killed = new FakeGateway([step("brmem", putArgs, { code: 124, killed: true, stderr: "timeout" })]);
		expect(await putBrmemEntryFromFile({ gateway: killed, cwd: ROOT, ...locator, sourceFile })).toMatchObject({
			ok: false,
			error: { code: "brmem_put_failed" },
		});
		killed.assertDone();

		const nonzero = new FakeGateway([step("brmem", putArgs, { code: 2, stderr: "bad args" })]);
		expect(await putBrmemEntryFromFile({ gateway: nonzero, cwd: ROOT, ...locator, sourceFile })).toMatchObject({
			ok: false,
			error: { code: "brmem_put_failed" },
		});
		nonzero.assertDone();

		const unavailable = new FakeGateway([step("brmem", putArgs, { code: 127, stderr: "brmem: command not found" })]);
		expect(await putBrmemEntryFromFile({ gateway: unavailable, cwd: ROOT, ...locator, sourceFile })).toMatchObject({
			ok: false,
			error: { code: "brmem_unavailable" },
		});
		unavailable.assertDone();
	});

	test("returns malformed output errors with display command evidence", async () => {
		const malformed = new FakeGateway([step("brmem", putArgs, { code: 0, stdout: "{" })]);
		const result = await putBrmemEntryFromFile({ gateway: malformed, cwd: ROOT, ...locator, sourceFile });

		malformed.assertDone();
		expect(result).toMatchObject({
			ok: false,
			error: { code: "brmem_malformed_put", displayCommand: "brmem put prompt.md --namespace ccc-dispatch --branch feature/demo --file /tmp/prompt.md --format json" },
		});
	});

	test("returns unexpected put data errors for mismatched response fields", async () => {
		const cases = [
			{ field: "namespace", data: { ...validData, namespace: "other" }, message: 'namespace "other" != "ccc-dispatch"' },
			{ field: "key", data: { ...validData, key: "other.md" }, message: 'key "other.md" != "prompt.md"' },
			{ field: "branch", data: { ...validData, branch: "other" }, message: 'branch "other" != "feature/demo"' },
			{ field: "source_file", data: { ...validData, source_file: "/tmp/other.md" }, message: 'source_file "/tmp/other.md" != "/tmp/prompt.md"' },
		];

		for (const testCase of cases) {
			const mismatched = new FakeGateway([step("brmem", putArgs, { code: 0, stdout: envelope(testCase.data) })]);
			const result = await putBrmemEntryFromFile({ gateway: mismatched, cwd: ROOT, ...locator, sourceFile });

			mismatched.assertDone();
			expect(result).toMatchObject({
				ok: false,
				error: { code: "brmem_unexpected_put_data", displayCommand: "brmem put prompt.md --namespace ccc-dispatch --branch feature/demo --file /tmp/prompt.md --format json" },
			});
			if (result.ok) throw new Error(`expected mismatch failure for ${testCase.field}`);
			expect(result.error.message).toContain(testCase.message);
		}
	});
});

describe("brmemCommandFailure", () => {
	test("formats command output and preserves the display command", () => {
		const error = brmemCommandFailure("brmem_put_failed", "brmem put failed", {
			type: "completed",
			candidate: { command: "brmem", prefixArgs: [] },
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
});

describe("parseBrmemPutData", () => {
	const validData = {
		namespace: "branch-context",
		key: "plan.md",
		branch: "feature/demo",
		ref_name: "refs/brmem/ns/branch-context/feature---demo:plan.md",
		commit: "0123456789abcdef",
		source_file: "/tmp/plan.md",
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
		expect(() => parseBrmemPutData(envelope(validData, { exit_code: 2, message: "failed" }))).toThrow(/exit_code 2: failed/);
		expect(() => parseBrmemPutData(JSON.stringify({ exit_code: 0 }))).toThrow(/expected a data object/);
	});

	test("throws for missing or non-string data fields", () => {
		expect(() => parseBrmemPutData(envelope({ ...validData, namespace: 123 }))).toThrow(/expected string fields/);
		expect(() => parseBrmemPutData(envelope({ ...validData, source_file: undefined }))).toThrow(/expected string fields/);
	});

	test("includes a bounded stdout tail in malformed-output messages", () => {
		const longStdout = JSON.stringify({ exit_code: 0, data: { ...validData, source_file: 123 }, padding: "x".repeat(5_000) });

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

import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	DEFAULT_BRMEM_TIMEOUT_MS,
	brmemCommandFailure,
	formatBrmemUnavailableMessage,
	parseBrmemPutData,
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

const tempDirs: string[] = [];

afterEach(() => {
	const dirs = tempDirs.splice(0);
	for (const dir of dirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

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

function makeProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "brmem-cli-"));
	writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "example"\n', "utf8");
	tempDirs.push(root);
	return root;
}

function envelope(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ exit_code: 0, data, ...overrides });
}

describe("resolveBrmemCommandCandidates", () => {
	test("returns PATH brmem when no local candidates exist", () => {
		expect(resolveBrmemCommandCandidates("/repo/pkg", { exists: fakeExists([]) })).toEqual([{ command: "brmem", prefixArgs: [] }]);
	});

	test("prefers ancestor venv brmem before PATH", () => {
		expect(resolveBrmemCommandCandidates("/repo/pkg", { exists: fakeExists(["/repo/.venv/bin/brmem"]) })).toEqual([
			{ command: "/repo/.venv/bin/brmem", prefixArgs: [] },
			{ command: "brmem", prefixArgs: [] },
		]);
	});

	test("adds uv run fallback when an ancestor pyproject exists", () => {
		expect(resolveBrmemCommandCandidates("/repo/pkg", { exists: fakeExists(["/repo/pyproject.toml"]) })).toEqual([
			{ command: "brmem", prefixArgs: [] },
			{ command: "uv", prefixArgs: ["run", "--directory", "/repo", "brmem"] },
		]);
	});

	test("keeps venv, PATH, and uv candidates in policy order", () => {
		expect(
			resolveBrmemCommandCandidates("/repo/pkg", {
				exists: fakeExists(["/repo/.venv/bin/brmem", "/repo/pyproject.toml"]),
			}),
		).toEqual([
			{ command: "/repo/.venv/bin/brmem", prefixArgs: [] },
			{ command: "brmem", prefixArgs: [] },
			{ command: "uv", prefixArgs: ["run", "--directory", "/repo", "brmem"] },
		]);
	});

	test("uses the nearest matching ancestor for venv and pyproject candidates", () => {
		expect(
			resolveBrmemCommandCandidates("/repo/pkg/app", {
				exists: fakeExists([
					"/repo/.venv/bin/brmem",
					"/repo/pkg/.venv/bin/brmem",
					"/repo/pyproject.toml",
					"/repo/pkg/pyproject.toml",
				]),
			}),
		).toEqual([
			{ command: "/repo/pkg/.venv/bin/brmem", prefixArgs: [] },
			{ command: "brmem", prefixArgs: [] },
			{ command: "uv", prefixArgs: ["run", "--directory", "/repo/pkg", "brmem"] },
		]);
	});
});

describe("runBrmemCandidate", () => {
	test("prepends prefix args, formats display command, and passes execution options", async () => {
		const signal = new AbortController().signal;
		const candidate: BrmemCommandCandidate = {
			command: "uv",
			prefixArgs: ["run", "--directory", "/repo with space", "brmem"],
		};
		const gateway = new FakeGateway([
			step("uv", ["run", "--directory", "/repo with space", "brmem", "put", "plans/key.md", "--file", "/tmp/plan with space.md"], {
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
		expect(run.args).toEqual([
			"run",
			"--directory",
			"/repo with space",
			"brmem",
			"put",
			"plans/key.md",
			"--file",
			"/tmp/plan with space.md",
		]);
		expect(run.displayCommand).toBe("uv run --directory '/repo with space' brmem put plans/key.md --file '/tmp/plan with space.md'");
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
	test("falls back from startup failure to the next candidate", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			errorStep("brmem", ["list", "--format", "json"], new Error("spawn ENOENT")),
			step("uv", ["run", "--directory", root, "brmem", "list", "--format", "json"], { code: 0, stdout: "{}" }),
		]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("completed");
		if (run.type !== "completed") throw new Error(`expected completed run, got ${run.type}`);
		expect(run.command).toBe("uv");
		expect(run.result.code).toBe(0);
	});

	test("falls back from command-not-found exit code 127 to the next candidate", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 127, stderr: "brmem: command not found" }),
			step("uv", ["run", "--directory", root, "brmem", "list", "--format", "json"], { code: 0, stdout: "{}" }),
		]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("completed");
		if (run.type !== "completed") throw new Error(`expected completed run, got ${run.type}`);
		expect(run.command).toBe("uv");
		expect(run.displayCommand).toBe(`uv run --directory ${root} brmem list --format json`);
	});

	test("falls back from explicit startupError result to the next candidate", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 127, stderr: "spawn brmem ENOENT", startupError: "spawn brmem ENOENT" }),
			step("uv", ["run", "--directory", root, "brmem", "list", "--format", "json"], { code: 0, stdout: "{}" }),
		]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("completed");
		if (run.type !== "completed") throw new Error(`expected completed run, got ${run.type}`);
		expect(run.command).toBe("uv");
	});

	test("includes every attempted display command when all candidates are unavailable", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			step("brmem", ["list", "--format", "json"], { code: 127, stderr: "brmem: command not found" }),
			step("uv", ["run", "--directory", root, "brmem", "list", "--format", "json"], {
				code: 127,
				stderr: "uv: no such file",
			}),
		]);

		const run = await runFirstAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["list", "--format", "json"], timeoutMs: 1000 });

		gateway.assertDone();
		expect(run.type).toBe("unavailable");
		if (run.type !== "unavailable") throw new Error(`expected unavailable run, got ${run.type}`);
		expect(run.failures).toHaveLength(2);
		const message = formatBrmemUnavailableMessage(run.failures);
		expect(message).toContain("No brmem command available");
		expect(message).toContain("Command: brmem list --format json");
		expect(message).toContain(`Command: uv run --directory ${root} brmem list --format json`);
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

	test("falls back through unavailable candidates", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			errorStep("brmem", ["check", "plan.md"], new Error("spawn ENOENT")),
			step("uv", ["run", "--directory", root, "brmem", "check", "plan.md"], { code: 1 }),
		]);

		const run = await runAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["check", "plan.md"], timeoutMs: 5678 });

		gateway.assertDone();
		expect(run.ok).toBe(true);
		if (!run.ok) throw new Error(`expected successful run: ${run.error.message}`);
		expect(run.value.command).toBe("uv");
		expect(run.value.result.code).toBe(1);
		expect(gateway.calls.map((call) => call.options?.timeout)).toEqual([5678, 5678]);
	});

	test("returns a structured unavailable error when every candidate is unavailable", async () => {
		const root = makeProjectRoot();
		const gateway = new FakeGateway([
			step("brmem", ["list"], { code: 127, stderr: "brmem: command not found" }),
			step("uv", ["run", "--directory", root, "brmem", "list"], { code: 127, stderr: "uv: no such file" }),
		]);

		const run = await runAvailableBrmemCommand({ gateway, cwd: root, brmemArgs: ["list"] });

		gateway.assertDone();
		expect(run).toMatchObject({ ok: false, error: { code: "brmem_unavailable" } });
		if (run.ok) throw new Error("expected unavailable result");
		expect(run.error.message).toContain("Command: brmem list");
		expect(run.error.message).toContain(`Command: uv run --directory ${root} brmem list`);
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

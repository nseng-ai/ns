import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	formatBrmemUnavailableMessage,
	resolveBrmemCommandCandidates,
	runBrmemCandidate,
	runFirstAvailableBrmemCommand,
	type BrmemCommandCandidate,
	type BrmemExecGateway,
} from "../src/brmem-cli.ts";
import type { PiExecResultLike } from "../src/command-runtime.ts";

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
	writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"example\"\n", "utf8");
	tempDirs.push(root);
	return root;
}

describe("resolveBrmemCommandCandidates", () => {
	test("returns PATH brmem when no local candidates exist", () => {
		expect(resolveBrmemCommandCandidates("/repo/pkg", { exists: fakeExists([]) })).toEqual([
			{ command: "brmem", prefixArgs: [] },
		]);
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
		expect(run.displayCommand).toBe(
			"uv run --directory '/repo with space' brmem put plans/key.md --file '/tmp/plan with space.md'",
		);
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
		expect(run.failure).toContain("brmem command failed before completion");
		expect(run.failure).toContain("spawn ENOENT");
	});

	test("preserves semantic nonzero and killed results as completed runs", async () => {
		for (const result of [
			{ code: 1, stderr: "absent" },
			{ code: 2, stderr: "invalid" },
			{ code: 127, killed: true, stderr: "command not found" },
		]) {
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
		if (run.type !== "completed") {
			throw new Error(`expected completed run, got ${run.type}`);
		}
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
		if (run.type !== "completed") {
			throw new Error(`expected completed run, got ${run.type}`);
		}
		expect(run.command).toBe("uv");
		expect(run.displayCommand).toBe(`uv run --directory ${root} brmem list --format json`);
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
		if (run.type !== "unavailable") {
			throw new Error(`expected unavailable run, got ${run.type}`);
		}
		expect(run.failures).toHaveLength(2);
		const message = formatBrmemUnavailableMessage(run.failures);
		expect(message).toContain("No brmem command available");
		expect(message).toContain("Command: brmem list --format json");
		expect(message).toContain(`Command: uv run --directory ${root} brmem list --format json`);
	});
});

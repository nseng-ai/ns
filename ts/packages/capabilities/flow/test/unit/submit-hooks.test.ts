import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import {
	flowSubmitHookFailureExitCode,
	formatFlowSubmitHookFailure,
	loadFlowSubmitHooks,
	parseFlowPreSubmitHooksToml,
	runFlowSubmitHooks,
	type FlowSubmitHook,
} from "../../src/submit/submit-hooks.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function execResult(result: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code ?? 0,
		killed: result.killed ?? false,
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
}

function expectConfigError(
	source: string,
	code: "invalid-toml" | "invalid-table" | "invalid-pre-submit",
	message: string,
): void {
	const result = parseFlowPreSubmitHooksToml(source, "ns.toml");
	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe(code);
		expect(result.error.message).toContain(message);
		expect(result.error.message).toContain("ns.toml");
	}
}

describe("flow submit hooks", () => {
	test("parses flow pre-submit hooks from TOML", () => {
		const result = parseFlowPreSubmitHooksToml(`
[flow.hooks]
pre_submit = ["just", "scripts/pre-submit --fix"]
`);

		expect(result).toEqual({
			ok: true,
			value: [
				{ display: "just", executable: "just", args: [] },
				{
					display: "scripts/pre-submit --fix",
					executable: "scripts/pre-submit",
					args: ["--fix"],
				},
			],
		});
	});

	test("treats missing flow hooks as empty", () => {
		expect(parseFlowPreSubmitHooksToml('[areg]\nagents = ["codex"]\n')).toEqual({
			ok: true,
			value: [],
		});
	});

	test("missing ns.toml loads as no hooks", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-submit-hooks-unit-"));
		tempDirs.push(repoRoot);
		const runner: CommandRunner = async (command, args) => {
			expect([command, ...args]).toEqual(["git", "rev-parse", "--show-toplevel"]);
			return execResult({ stdout: `${repoRoot}\n` });
		};

		expect(await loadFlowSubmitHooks({ cwd: repoRoot, runner })).toEqual({ kind: "none" });
	});

	test("reports invalid hook config cases", () => {
		expectConfigError("[flow.hooks\n", "invalid-toml", "Invalid TOML");
		expectConfigError("flow = 1\n", "invalid-table", "[flow] must be a TOML table");
		expectConfigError("[flow]\nhooks = 1\n", "invalid-table", "[flow.hooks] must be a TOML table");
		expectConfigError(
			'[flow.hooks]\npre_submit = "just"\n',
			"invalid-pre-submit",
			"must be a TOML array of non-empty strings",
		);
		expectConfigError(
			'[flow.hooks]\npre_submit = ["just", ""]\n',
			"invalid-pre-submit",
			"must contain only non-empty strings",
		);
	});

	test("runs hooks sequentially and forwards output", async () => {
		const calls: string[] = [];
		const output: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
		const runner: CommandRunner = async (command, args, options) => {
			calls.push([command, ...args].join(" "));
			options?.onStdout?.(`${command} stdout\n`);
			return execResult();
		};

		expect(
			await runFlowSubmitHooks({
				hooks: [hook("just"), hook("scripts/check --strict")],
				runner,
				onOutput: (stream, text) => output.push({ stream, text }),
			}),
		).toEqual({ kind: "passed" });
		expect(calls).toEqual(["just", "scripts/check --strict"]);
		expect(output).toEqual([
			{ stream: "stdout", text: "just stdout\n" },
			{ stream: "stdout", text: "scripts/check stdout\n" },
		]);
	});

	test("formats failed hook output and truncates long tails", () => {
		const failure = {
			hook: hook("just"),
			result: execResult({
				code: 1,
				stdout: `${"a".repeat(4_050)}\nkept stdout\n`,
				stderr: "kept stderr\n",
			}),
		};

		const formatted = formatFlowSubmitHookFailure(failure);
		expect(flowSubmitHookFailureExitCode(failure)).toBe(1);
		expect(formatted).toContain(
			"Pre-submit hook failed: just (exit code 1). Submission was not attempted.",
		);
		expect(formatted).toContain("… ");
		expect(formatted).toContain("leading character(s) omitted");
		expect(formatted).toContain("kept stdout");
		expect(formatted).toContain("kept stderr");
		expect(formatted).toContain(
			"Fix the failure, or rerun with --no-hooks to skip pre-submit hooks.",
		);
		expect(formatted.length).toBeLessThan(4_500);
	});

	test("formats startup and killed hook failures", () => {
		const failure = {
			hook: hook("missing-hook"),
			result: execResult({ code: 0, killed: true, startupError: "spawn ENOENT" }),
		};

		expect(flowSubmitHookFailureExitCode(failure)).toBe(1);
		expect(formatFlowSubmitHookFailure(failure)).toContain("Startup error: spawn ENOENT");
		expect(formatFlowSubmitHookFailure(failure)).toContain(
			"The hook was killed before completing (timeout or signal).",
		);
	});
});

function hook(display: string): FlowSubmitHook {
	const [executable, ...args] = display.split(/\s+/);
	if (executable === undefined || executable === "") {
		throw new Error(`Invalid test hook: ${display}`);
	}
	return { display, executable, args };
}

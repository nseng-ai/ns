import { rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import {
	flowSubmitHookFailureExitCode,
	formatFlowSubmitHookFailure,
	loadFlowSubmitHooks,
	parseFlowSubmitHookCommands,
	runFlowSubmitHooks,
	type FlowSubmitHook,
} from "../../src/submit/submit-hooks.ts";
import { writeTestPointManifest } from "../support/point-manifest.ts";

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

async function createSubmitHooksRepo(nsToml: string): Promise<string> {
	const repoRoot = await mkdtemp(join(tmpdir(), "ns-submit-hooks-unit-"));
	tempDirs.push(repoRoot);
	await writeTestPointManifest(repoRoot, {
		group: "flow",
		points: [
			{
				path: ["submit", "pre"],
				accepts: "hook",
				semantics: "additive",
				description: "Runs before submit.",
			},
		],
	});
	await writeFile(
		join(repoRoot, "ns.toml"),
		`extensions = ["./extensions/flow"]\n${nsToml}`,
		"utf8",
	);
	return repoRoot;
}

async function expectConfigError(
	source: string,
	code: "invalid-config" | "invalid-pre-submit",
	message: string,
): Promise<void> {
	const repoRoot = await createSubmitHooksRepo(source);
	const result = await loadFlowSubmitHooks({ repoRoot });
	expect(result.kind).toBe("invalid");
	if (result.kind === "invalid") {
		expect(result.error.code).toBe(code);
		expect(result.error.message).toContain(message);
		expect(result.error.message).toContain("ns.toml");
	}
}

describe("flow submit hooks", () => {
	test("parses flow.submit.pre command strings", () => {
		const result = parseFlowSubmitHookCommands(["just", "scripts/pre-submit --fix"]);

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

	test("loads point-system flow submit hooks from ns.toml", async () => {
		const repoRoot = await createSubmitHooksRepo(`
[points]
"flow.submit.pre" = ["just", "scripts/pre-submit --fix"]
`);
		expect(await loadFlowSubmitHooks({ repoRoot })).toEqual({
			kind: "hooks",
			hooks: [
				{ display: "just", executable: "just", args: [] },
				{
					display: "scripts/pre-submit --fix",
					executable: "scripts/pre-submit",
					args: ["--fix"],
				},
			],
		});
	});

	test("missing ns.toml loads as no hooks", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-submit-hooks-unit-"));
		tempDirs.push(repoRoot);
		expect(await loadFlowSubmitHooks({ repoRoot })).toEqual({ kind: "none" });
	});

	test("reports invalid hook config cases", async () => {
		await expectConfigError("[points\n", "invalid-config", "Invalid TOML");
		await expectConfigError(
			'[points]\n"flow.submit.pre" = "just"\n',
			"invalid-config",
			"hook point flow.submit.pre must be an array of command strings",
		);
		await expectConfigError(
			'[points]\n"flow.submit.pre" = ["just", ""]\n',
			"invalid-pre-submit",
			"must contain only non-empty strings",
		);
		await expectConfigError(
			'[flow.hooks]\npre_submit = ["just"]\n',
			"invalid-config",
			'[flow.hooks] is no longer supported; install pre-submit hooks at [points]."flow.submit.pre"',
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
		expect(formatted).toContain("…");
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
		expect(formatFlowSubmitHookFailure(failure)).toContain(
			"Pre-submit hook failed (failed before completion).",
		);
		expect(formatFlowSubmitHookFailure(failure)).toContain("spawn ENOENT");
	});
});

function hook(display: string): FlowSubmitHook {
	const [executable, ...args] = display.split(/\s+/);
	if (executable === undefined || executable === "") {
		throw new Error(`Invalid test hook: ${display}`);
	}
	return { display, executable, args };
}

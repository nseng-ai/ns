// Pre-submit hooks for `ns flow submit`.
//
// The hook MECHANISM is platform code (this module); each configured hook is consumer config in the
// repo-root `ns.toml`:
//
//   [flow.hooks]
//   pre_submit = ["just"]
//
// Hooks run in order before the checkpoint step, so files a hook rewrites (formatters) land in the
// checkpoint commit. Each entry is whitespace-split into an argv and executed directly — no shell
// interpretation; point an entry at a script for anything richer. The first failing hook aborts the
// submit before any state changes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CommandRunner, ExecOutputListener, ExecResult } from "@nseng-ai/foundation/command";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import { parse } from "smol-toml";

/** Hooks run consumer validation suites (for example `just`), so allow far longer than a git call. */
const PRE_SUBMIT_HOOK_TIMEOUT_MS = 1_800_000;
const REPO_ROOT_TIMEOUT_MS = 30_000;
const HOOK_FAILURE_OUTPUT_MAX_CHARS = 4_000;

export interface FlowSubmitHook {
	/** The configured hook string verbatim, for progress labels and failure messages. */
	display: string;
	executable: string;
	args: readonly string[];
}

export interface FlowHooksConfigError {
	code: "unreadable" | "invalid-toml" | "invalid-table" | "invalid-pre-submit";
	message: string;
}

export type FlowHooksParseResult = Result<readonly FlowSubmitHook[], FlowHooksConfigError>;

export function parseFlowPreSubmitHooksToml(
	source: string,
	pathLabel?: string,
): FlowHooksParseResult {
	let data: unknown;
	try {
		data = parse(source);
	} catch (error) {
		return resultErrOf(
			"invalid-toml",
			formatMessage(`Invalid TOML: ${formatErrorMessage(error)}`, pathLabel),
		);
	}

	if (!isRecord(data)) return { ok: true, value: [] };
	const flow = data.flow;
	if (flow === undefined) return { ok: true, value: [] };
	if (!isRecord(flow)) {
		return resultErrOf("invalid-table", formatMessage("[flow] must be a TOML table.", pathLabel));
	}
	const hooks = flow.hooks;
	if (hooks === undefined) return { ok: true, value: [] };
	if (!isRecord(hooks)) {
		return resultErrOf(
			"invalid-table",
			formatMessage("[flow.hooks] must be a TOML table.", pathLabel),
		);
	}
	const preSubmit = hooks.pre_submit;
	if (preSubmit === undefined) return { ok: true, value: [] };
	if (!Array.isArray(preSubmit)) {
		return resultErrOf(
			"invalid-pre-submit",
			formatMessage(
				"[flow.hooks].pre_submit must be a TOML array of non-empty strings.",
				pathLabel,
			),
		);
	}

	const parsed: FlowSubmitHook[] = [];
	for (const entry of preSubmit) {
		if (typeof entry !== "string" || entry.trim() === "") {
			return resultErrOf(
				"invalid-pre-submit",
				formatMessage("[flow.hooks].pre_submit must contain only non-empty strings.", pathLabel),
			);
		}
		const display = entry.trim();
		const [executable, ...args] = display.split(/\s+/);
		if (executable === undefined || executable === "") {
			return resultErrOf(
				"invalid-pre-submit",
				formatMessage("[flow.hooks].pre_submit must contain only non-empty strings.", pathLabel),
			);
		}
		parsed.push({ display, executable, args });
	}
	return { ok: true, value: parsed };
}

export type FlowSubmitHooksLoad =
	| { kind: "none" }
	| { kind: "hooks"; hooks: readonly FlowSubmitHook[] }
	| { kind: "invalid"; error: FlowHooksConfigError };

export interface LoadFlowSubmitHooksOptions {
	cwd: string;
	runner: CommandRunner;
}

/**
 * Locate the repo-root `ns.toml` and parse its pre-submit hooks. A missing repo (not a git worktree)
 * or missing/empty config is `none` — submit's own preflight surfaces repo problems with better
 * messages than a hook loader could.
 */
export async function loadFlowSubmitHooks(
	options: LoadFlowSubmitHooksOptions,
): Promise<FlowSubmitHooksLoad> {
	const revParse = await options.runner("git", ["rev-parse", "--show-toplevel"], {
		timeout: REPO_ROOT_TIMEOUT_MS,
	});
	if (revParse.code !== 0 || revParse.startupError !== undefined) return { kind: "none" };
	const repoRoot = revParse.stdout.trim();
	if (repoRoot === "") return { kind: "none" };

	const path = join(repoRoot, "ns.toml");
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) return { kind: "none" };
		return {
			kind: "invalid",
			error: {
				code: "unreadable",
				message: `Failed to read ${path}: ${formatErrorMessage(error)}`,
			},
		};
	}

	const parsed = parseFlowPreSubmitHooksToml(source, path);
	if (!parsed.ok) return { kind: "invalid", error: parsed.error };
	if (parsed.value.length === 0) return { kind: "none" };
	return { kind: "hooks", hooks: parsed.value };
}

export interface FlowSubmitHookFailure {
	hook: FlowSubmitHook;
	result: ExecResult;
}

export type FlowSubmitHooksRunResult =
	| { kind: "passed" }
	| ({ kind: "failed" } & FlowSubmitHookFailure);

export interface RunFlowSubmitHooksOptions {
	hooks: readonly FlowSubmitHook[];
	runner: CommandRunner;
	onHookStarted?: (progress: { hook: FlowSubmitHook; index: number; total: number }) => void;
	onOutput?: ExecOutputListener;
}

/** Run hooks in order at the runner's working directory; stop at the first failure. */
export async function runFlowSubmitHooks(
	options: RunFlowSubmitHooksOptions,
): Promise<FlowSubmitHooksRunResult> {
	const total = options.hooks.length;
	for (const [index, hook] of options.hooks.entries()) {
		options.onHookStarted?.({ hook, index, total });
		const onOutput = options.onOutput;
		const result = await options.runner(hook.executable, hook.args, {
			timeout: PRE_SUBMIT_HOOK_TIMEOUT_MS,
			...(onOutput === undefined
				? {}
				: {
						onStdout: (text: string) => onOutput("stdout", text),
						onStderr: (text: string) => onOutput("stderr", text),
					}),
		});
		if (result.code !== 0 || result.killed || result.startupError !== undefined) {
			return { kind: "failed", hook, result };
		}
	}
	return { kind: "passed" };
}

export function flowSubmitHookFailureExitCode(failure: FlowSubmitHookFailure): number {
	return failure.result.code === 0 ? 1 : failure.result.code;
}

export function formatFlowSubmitHookFailure(failure: FlowSubmitHookFailure): string {
	const lines = [
		`Pre-submit hook failed: ${failure.hook.display} (exit code ${failure.result.code}). Submission was not attempted.`,
	];
	if (failure.result.startupError !== undefined) {
		lines.push("", `Startup error: ${failure.result.startupError}`);
	}
	if (failure.result.killed) {
		lines.push("", "The hook was killed before completing (timeout or signal).");
	}
	const tail = boundHookOutputTail(failure.result);
	if (tail !== "") {
		lines.push("", tail);
	}
	lines.push("", "Fix the failure, or rerun with --no-hooks to skip pre-submit hooks.");
	return `${lines.join("\n")}\n`;
}

function boundHookOutputTail(result: ExecResult): string {
	const combined = [result.stdout.trimEnd(), result.stderr.trimEnd()]
		.filter((text) => text !== "")
		.join("\n");
	if (combined.length <= HOOK_FAILURE_OUTPUT_MAX_CHARS) return combined;
	const omittedChars = combined.length - HOOK_FAILURE_OUTPUT_MAX_CHARS;
	return `… ${omittedChars} leading character(s) omitted\n${combined.slice(-HOOK_FAILURE_OUTPUT_MAX_CHARS)}`;
}

function isMissingFileError(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

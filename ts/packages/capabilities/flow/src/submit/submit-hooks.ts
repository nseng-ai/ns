// Pre-submit hooks for `ns flow submit`.
//
// The hook MECHANISM is platform code (this module); each configured hook is consumer config installed
// at the `flow.submit.pre` point in the repo-root `ns.toml`:
//
//   [points]
//   "flow.submit.pre" = ["just"]
//
// Hooks run in order before the checkpoint step, so files a hook rewrites (formatters) land in the
// checkpoint commit. Each entry is whitespace-split into an argv and executed directly — no shell
// interpretation; point an entry at a script for anything richer. The first failing hook aborts the
// submit before any state changes.

import type { CommandRunner, ExecOutputListener, ExecResult } from "@nseng-ai/foundation/command";
import {
	formatCommandResultFailure,
	outputListenerToExecCallbacks,
} from "@nseng-ai/foundation/command";
import {
	hookCommandsForPoint,
	loadPointCatalog,
	nodeProjectConfigGateway,
	type ProjectConfigDiagnostic,
} from "@nseng-ai/kernel/project-config/points";
import { z } from "zod";

/** Hooks run consumer validation suites (for example `just`), so allow far longer than a git call. */
const PRE_SUBMIT_HOOK_TIMEOUT_MS = 1_800_000;
const REPO_ROOT_TIMEOUT_MS = 30_000;

export interface FlowSubmitHook {
	/** The configured hook string verbatim, for progress labels and failure messages. */
	display: string;
	executable: string;
	args: readonly string[];
}

const FLOW_SUBMIT_PRE_POINT_ID = "flow.submit.pre";
const LEGACY_FLOW_HOOKS_SETTING_SCHEMA = {
	path: ["flow", "hooks"] as const,
	schema: z.never(),
};

export interface FlowHooksConfigError {
	code: "invalid-config" | "invalid-pre-submit";
	message: string;
}

export function parseFlowSubmitHookCommands(
	commands: readonly string[],
	pathLabel = `ns.toml: [points].${JSON.stringify(FLOW_SUBMIT_PRE_POINT_ID)}`,
): { ok: true; value: readonly FlowSubmitHook[] } | { ok: false; error: FlowHooksConfigError } {
	const parsed: FlowSubmitHook[] = [];
	for (const entry of commands) {
		if (entry.trim() === "") {
			return {
				ok: false,
				error: {
					code: "invalid-pre-submit",
					message: `${pathLabel} must contain only non-empty strings.`,
				},
			};
		}
		const display = entry.trim();
		const [executable = "", ...args] = display.split(/\s+/);
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

	const catalog = loadPointCatalog({
		repoRoot,
		gateway: nodeProjectConfigGateway,
		settingsSchemas: [LEGACY_FLOW_HOOKS_SETTING_SCHEMA],
	});
	const blockingDiagnostics = catalog.diagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	);
	if (blockingDiagnostics.length > 0) {
		return {
			kind: "invalid",
			error: {
				code: "invalid-config",
				message: formatCatalogDiagnostics(blockingDiagnostics),
			},
		};
	}

	const commands = hookCommandsForPoint(catalog, FLOW_SUBMIT_PRE_POINT_ID);
	if (commands.length === 0) return { kind: "none" };
	const parsed = parseFlowSubmitHookCommands(commands);
	if (!parsed.ok) return { kind: "invalid", error: parsed.error };
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
		const result = await options.runner(hook.executable, hook.args, {
			timeout: PRE_SUBMIT_HOOK_TIMEOUT_MS,
			...outputListenerToExecCallbacks(options.onOutput),
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
	return `${[
		formatCommandResultFailure(
			"Pre-submit hook failed",
			failure.hook.executable,
			failure.hook.args,
			failure.result,
		),
		"Submission was not attempted.",
		"Fix the failure, or rerun with --no-hooks to skip pre-submit hooks.",
	].join("\n\n")}\n`;
}

function formatCatalogDiagnostics(diagnostics: readonly ProjectConfigDiagnostic[]): string {
	return diagnostics.map(formatCatalogDiagnostic).join("\n");
}

function formatCatalogDiagnostic(diagnostic: ProjectConfigDiagnostic): string {
	if (diagnostic.code === "settings_table_invalid" && diagnostic.path === "flow.hooks") {
		return 'ns.toml: [flow.hooks] is no longer supported; install pre-submit hooks at [points]."flow.submit.pre".';
	}
	return diagnostic.message;
}

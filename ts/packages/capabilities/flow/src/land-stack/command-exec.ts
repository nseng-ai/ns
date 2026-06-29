import {
	execApiToCommandRunner,
	type ExecResult,
	formatOutputSection,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	tailText,
} from "@sdl/exec";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";
import { GRAPHITE_COMMAND_NAME, runGraphiteCommand } from "@sdl/graphite/branch";
import {
	MAX_COMMAND_STREAM_OUTPUT_LINES,
	MAX_OUTPUT_TAIL_CHARS,
	MAX_OUTPUT_TAIL_LINES,
} from "./constants.ts";
import type { CommandStreamFinish, LandStackExtensionAPI } from "./types.ts";

export interface CheckedOutElsewhere {
	branch: string;
	path: string;
}

export interface ExecOptions {
	pi: LandStackExtensionAPI;
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export async function exec(options: ExecOptions): Promise<ExecResult> {
	const result = await execRaw(options);
	return normalizeCommandFinish(options.command, options.args, result).result;
}

export async function execRaw(options: ExecOptions): Promise<ExecResult> {
	return runNormalizedExecResult(
		async () =>
			await options.pi.exec(options.command, options.args, {
				cwd: options.cwd,
				timeout: options.timeoutMs,
			}),
	);
}

export interface ExecGraphiteOptions {
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export async function execGraphite(
	pi: LandStackExtensionAPI,
	options: ExecGraphiteOptions,
): Promise<ExecResult> {
	const result = await execRawGraphite(pi, options);
	return normalizeCommandFinish(GRAPHITE_COMMAND_NAME, options.args, result).result;
}

export async function execRawGraphite(
	pi: LandStackExtensionAPI,
	options: ExecGraphiteOptions,
): Promise<ExecResult> {
	return runNormalizedExecResult(
		async () =>
			await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), options),
	);
}

export function normalizeCommandFinish(
	command: string,
	args: string[],
	result: ExecResult,
): CommandStreamFinish {
	const deleteBranch =
		command === GRAPHITE_COMMAND_NAME && args[0] === "delete" ? args[1] : undefined;
	if (
		deleteBranch &&
		result.code !== 0 &&
		!result.killed &&
		isGtDeleteMissingBranch(result, deleteBranch)
	) {
		return { result: { ...result, code: 0 }, note: `branch ${deleteBranch} already absent` };
	}
	// /sdl:flow:land reads Graphite topology through a controlled SDL flow exec command;
	// avoid labeling unrelated sdl invocations just because the binary matches.
	if (
		command === "sdl" &&
		result.code === 0 &&
		args[0] === "flow" &&
		args[1] === "exec" &&
		args[2] === "read-graphite-branch-metadata"
	) {
		return { result, note: "read Graphite stack topology" };
	}
	return { result };
}

export function commandStreamOutputLines(result: ExecResult): string[] {
	const output = outputTail(stripAnsi(`${result.stderr}\n${result.stdout}`).replace(/\r/g, "\n"));
	if (!output) return [];
	return output
		.split("\n")
		.slice(-MAX_COMMAND_STREAM_OUTPUT_LINES)
		.map((line) => `  │ ${line}`);
}

export function formatCommandDetails(result: ExecResult, commandDisplay?: string): string {
	const killed = result.killed ? " (killed or timed out)" : "";
	const lines: string[] = [];
	if (commandDisplay) {
		lines.push(`$ ${commandDisplay}`);
	}
	lines.push(`exit ${result.code}${killed}`);
	lines.push(
		formatOutputSection("stdout", result.stdout, {
			maxLines: MAX_OUTPUT_TAIL_LINES,
			maxChars: MAX_OUTPUT_TAIL_CHARS,
		}),
	);
	lines.push(
		formatOutputSection("stderr", result.stderr, {
			maxLines: MAX_OUTPUT_TAIL_LINES,
			maxChars: MAX_OUTPUT_TAIL_CHARS,
		}),
	);
	return lines.join("\n");
}

export function outputTail(output: string): string {
	const trimmed = output.trimEnd();
	if (!trimmed) return "";
	return tailText(trimmed, { maxLines: MAX_OUTPUT_TAIL_LINES, maxChars: MAX_OUTPUT_TAIL_CHARS });
}

export function isGtDeleteMissingBranch(result: ExecResult, branch: string): boolean {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`).toLowerCase();
	return output.includes(`could not find branch ${branch.toLowerCase()}`);
}

export function parseGitCheckedOutElsewhere(result: ExecResult): CheckedOutElsewhere | undefined {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`);
	const match = output.match(
		/fatal:\s*['"]([^'"]+)['"] is already checked out at ['"]([^'"]+)['"]/i,
	);
	if (!match) return undefined;
	const branch = match[1];
	const path = match[2];
	if (!branch || !path) return undefined;
	return { branch, path };
}

export function stripAnsi(text: string): string {
	return stripTerminalEscapes(text);
}

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

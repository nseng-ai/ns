import {
	formatOutputSection,
	normalizeExecResult,
	stripTerminalEscapes,
	tailText,
	type ExecResult,
} from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { MAX_COMMAND_STREAM_OUTPUT_LINES, MAX_OUTPUT_TAIL_CHARS, MAX_OUTPUT_TAIL_LINES } from "./constants.ts";
import type { CommandStreamFinish, LandStackExtensionAPI } from "./types.ts";

export interface CheckedOutElsewhere {
	branch: string;
	path: string;
}

export async function exec(
	pi: LandStackExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<ExecResult> {
	const result = await execRaw(pi, command, args, cwd, timeout);
	return normalizeCommandFinish(command, args, result).result;
}

export async function execRaw(
	pi: LandStackExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<ExecResult> {
	try {
		return normalizeExecResult(await pi.exec(command, args, { cwd, timeout }));
	} catch (error) {
		return {
			stdout: "",
			stderr: formatErrorMessage(error),
			code: 1,
			killed: false,
		};
	}
}

export function normalizeCommandFinish(command: string, args: string[], result: ExecResult): CommandStreamFinish {
	const deleteBranch = command === "gt" && args[0] === "delete" ? args[1] : undefined;
	if (deleteBranch && result.code !== 0 && !result.killed && isGtDeleteMissingBranch(result, deleteBranch)) {
		return { result: { ...result, code: 0 }, note: `branch ${deleteBranch} already absent` };
	}
	// /code:land's only sqlite3 use is reading Graphite topology, so successful
	// sqlite3 commands in the land stream can carry this domain label.
	if (command === "sqlite3" && result.code === 0) {
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
	lines.push(formatOutputSection("stdout", result.stdout, { maxLines: MAX_OUTPUT_TAIL_LINES, maxChars: MAX_OUTPUT_TAIL_CHARS }));
	lines.push(formatOutputSection("stderr", result.stderr, { maxLines: MAX_OUTPUT_TAIL_LINES, maxChars: MAX_OUTPUT_TAIL_CHARS }));
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
	const match = output.match(/fatal:\s*['"]([^'"]+)['"] is already checked out at ['"]([^'"]+)['"]/i);
	if (!match) return undefined;
	const branch = match[1];
	const path = match[2];
	if (!branch || !path) return undefined;
	return { branch, path };
}

export function isGtDeleteCheckedOutElsewhere(result: ExecResult): boolean {
	return parseGitCheckedOutElsewhere(result) !== undefined;
}

export function stripAnsi(text: string): string {
	return stripTerminalEscapes(text);
}

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

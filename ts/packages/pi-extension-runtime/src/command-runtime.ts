import { stripTerminalEscapes } from "./terminal-presentation.ts";

export { stripTerminalEscapes } from "./terminal-presentation.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export interface PiExecResultLike {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
}

export interface TailTextOptions {
	maxChars: number;
	maxLines?: number;
}

const MAX_ERROR_CHARS = 4_000;

export function normalizeExecResult(result: PiExecResultLike): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
	};
}

export function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].map(formatShellArg).join(" ");
}

export function formatShellArg(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}

	return shellQuote(value);
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function tailText(text: string, options: TailTextOptions): string {
	const maxChars = Math.max(0, Math.trunc(options.maxChars));
	const lineLimited = applyLineLimit(text, options.maxLines);
	let tail = lineLimited.text;

	if (tail.length > maxChars) {
		tail = maxChars === 0 ? "…" : `…${tail.slice(-maxChars)}`;
	}

	if (lineLimited.omittedLines > 0) {
		return `… ${lineLimited.omittedLines} earlier line(s) omitted\n${tail}`;
	}

	return tail;
}

export function truncateTail(text: string, maxChars: number): string {
	const tail = tailText(text, { maxChars });
	if (tail === text) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${tail.slice(1)}`;
}

export function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateTail(
		`command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		MAX_ERROR_CHARS,
	);
}

export function formatExecStartupFailure(commandDisplay: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return truncateTail(`command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${message}`, MAX_ERROR_CHARS);
}

function applyLineLimit(text: string, maxLines: number | undefined): { text: string; omittedLines: number } {
	if (maxLines === undefined) {
		return { text, omittedLines: 0 };
	}

	const normalizedMaxLines = Math.max(0, Math.trunc(maxLines));
	const lines = text.split("\n");
	if (lines.length <= normalizedMaxLines) {
		return { text, omittedLines: 0 };
	}

	if (normalizedMaxLines === 0) {
		return { text: "", omittedLines: lines.length };
	}

	return {
		text: lines.slice(-normalizedMaxLines).join("\n"),
		omittedLines: lines.length - normalizedMaxLines,
	};
}

export function formatOutputSection(name: "stdout" | "stderr", output: string, options: TailTextOptions): string {
	const normalizedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n").trimEnd();
	const tail = normalizedOutput ? tailText(normalizedOutput, options) : "";
	return [`----- ${name} tail -----`, tail || "(empty)"].join("\n");
}

export function formatPlainOutputSection(name: string, output: string, options: TailTextOptions): string {
	const trimmed = output.trim();
	return trimmed.length > 0 ? `${name}:\n${tailText(trimmed, options)}` : "";
}

export function stripTerminalEscapes(value: string): string {
	return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

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

export function normalizeExecResult(result: PiExecResultLike): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
	};
}

export function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].map(shellQuoteForDisplay).join(" ");
}

function shellQuoteForDisplay(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}

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
	const tail = normalizedOutput.length > 0 ? tailText(normalizedOutput, options) : "";
	return [`----- ${name} tail -----`, tail.length > 0 ? tail : "(empty)"].join("\n");
}

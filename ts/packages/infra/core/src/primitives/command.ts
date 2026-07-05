import { formatErrorMessage } from "./primitives.ts";
import { stripTerminalEscapes } from "./terminal-escapes.ts";

const STARTUP_FAILURE_EXIT_CODE = 127;
export const MAX_ERROR_CHARS = 4_000;

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError?: string;
}

export type ExecOutputStream = "stdout" | "stderr";
export type ExecOutputListener = (stream: ExecOutputStream, text: string) => void;

export interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
	timeoutKillGraceMs?: number;
	signal?: AbortSignal;
	stdin?: string;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

export function outputListenerToExecCallbacks(
	onOutput: ExecOutputListener | undefined,
): Pick<ExecOptions, "onStdout" | "onStderr"> {
	if (onOutput === undefined) return {};
	return {
		onStdout(text) {
			onOutput("stdout", text);
		},
		onStderr(text) {
			onOutput("stderr", text);
		},
	};
}

export type CommandRunner = (
	executable: string,
	args: readonly string[],
	options?: ExecOptions,
) => Promise<ExecResult>;

/**
 * ns's command execution gateway.
 *
 * This shape is intentionally compatible with Pi's extension-host `ctx.exec`,
 * but ns's `ExecOptions`/`ExecResult` contract is wider. Code that relies on
 * behavior Pi does not provide, such as stdin piping, must require a narrower
 * capability interface instead of this Pi-compatible base shape.
 */
export interface CommandExecApi {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

/**
 * A CommandExecApi whose exec implementation actually pipes `options.stdin` to the
 * child process. The Pi host `exec` is intentionally NOT branded: it silently drops
 * stdin, so code that drives `git mktree`/`git hash-object` etc. must require this brand.
 */
export interface StdinCapableCommandExecApi extends CommandExecApi {
	readonly supportsStdin: true;
}

export function execApiToCommandRunner(execApi: CommandExecApi): CommandRunner {
	return async (command, args, options) => await execApi.exec(command, [...args], options);
}

export interface PiExecResultLike {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
	startupError?: string;
}

export interface PiExecApiLike {
	exec(command: string, args: string[], options?: ExecOptions): Promise<PiExecResultLike>;
}

export function piExecApiToCommandExecApi(execApi: PiExecApiLike): CommandExecApi {
	return {
		async exec(command, args, options) {
			return normalizeExecResult(await execApi.exec(command, args, options));
		},
	};
}

export interface TailTextOptions {
	maxChars: number;
	maxLines?: number;
}

export type CommandResolver = (name: string) => string | undefined;

export type CommandBackedSkillRegistrationKind = "generic-backing-skill" | "specialized-command";

export interface CommandBackedSkillRegistration {
	skillName: string;
	surface: string;
	kind: CommandBackedSkillRegistrationKind;
}

export interface SpecializedCommandBackedSkillSpec {
	skillName: string;
	surface: string;
}

export function specializedCommandBackedSkillsFromSpecs(
	specs: readonly SpecializedCommandBackedSkillSpec[],
): readonly CommandBackedSkillRegistration[] {
	return specs.map((spec) => ({
		skillName: spec.skillName,
		surface: spec.surface,
		kind: "specialized-command",
	}));
}

export interface CommandPrefix {
	command: string;
	args: string[];
}

export function normalizeExecResult(result: PiExecResultLike): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
}

export async function runNormalizedExecResult(
	run: () => Promise<PiExecResultLike>,
): Promise<ExecResult> {
	try {
		return normalizeExecResult(await run());
	} catch (error) {
		const startupError = formatErrorMessage(error);
		return {
			stdout: "",
			stderr: startupError,
			code: STARTUP_FAILURE_EXIT_CODE,
			killed: false,
			startupError,
		};
	}
}

export function commandSucceeded(result: ExecResult): boolean {
	return result.code === 0 && !result.killed;
}

export interface FormatCommandEvidenceOptions {
	intro: string;
	command: string;
	cwd: string;
	result: ExecResult;
	guidance?: string;
}

export function formatCommandEvidence(options: FormatCommandEvidenceOptions): string {
	const sections = [
		options.intro,
		`Command: ${options.command}`,
		`Cwd: ${options.cwd}`,
		`Exit: ${options.result.code}`,
		`Killed: ${options.result.killed}`,
	];
	if (options.guidance !== undefined) {
		sections.push(options.guidance);
	}
	sections.push(
		"stdout:",
		formatCommandEvidenceOutput(options.result.stdout),
		"stderr:",
		formatCommandEvidenceOutput(options.result.stderr),
	);
	return sections.join("\n");
}

export function commandFailureReason(result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr !== "" ? stderr : `exit code ${result.code}${result.killed ? " (killed)" : ""}`;
}

export function formatCommandError(
	summary: string,
	result: Pick<ExecResult, "stdout" | "stderr" | "code" | "killed">,
): string {
	return [summary, formatCommandDetails(result)].join("\n");
}

export function formatCommandDetails(
	result: Pick<ExecResult, "stdout" | "stderr" | "code" | "killed">,
): string {
	const details = firstNonEmptyTrimmed(result.stderr, result.stdout);
	const killed = result.killed ? " (killed or timed out)" : "";
	return details === ""
		? `exit ${result.code}${killed}`
		: `exit ${result.code}${killed}: ${details}`;
}

export function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].map(formatShellArg).join(" ");
}

export function formatCommandResultFailure(
	title: string,
	command: string,
	args: readonly string[],
	result: ExecResult,
): string {
	const displayCommand = formatCommand(command, args);
	if (result.startupError !== undefined) {
		return formatCommandStartupFailure(title, displayCommand, result.startupError);
	}
	return formatCommandFailure(title, displayCommand, result);
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

export function formatOutputSection(
	name: "stdout" | "stderr",
	output: string,
	options: TailTextOptions,
): string {
	const normalizedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n").trimEnd();
	const tail = normalizedOutput.length > 0 ? tailText(normalizedOutput, options) : "";
	return [`----- ${name} tail -----`, tail.length > 0 ? tail : "(empty)"].join("\n");
}

function formatCommandEvidenceOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}

function firstNonEmptyTrimmed(primary: string, fallback: string): string {
	const primaryDetails = primary.trim();
	if (primaryDetails !== "") return primaryDetails;
	return fallback.trim();
}

export function formatCommandFailure(
	title: string,
	displayCommand: string,
	result: ExecResult,
): string {
	const status = result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

export function formatCommandStartupFailure(
	title: string,
	displayCommand: string,
	error: unknown,
): string {
	const message = stripTerminalEscapes(formatErrorMessage(error)).replace(/\r/g, "\n").trimEnd();
	return tailText(
		[
			`${title} (failed before completion).`,
			`Command: ${displayCommand}`,
			["error:", message.length > 0 ? message : "(empty)"].join("\n"),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

function applyLineLimit(
	text: string,
	maxLines: number | undefined,
): { text: string; omittedLines: number } {
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

import { formatErrorMessage } from "./primitives.ts";
import { stripTerminalEscapes } from "./terminal-escapes.ts";

export const MAX_ERROR_CHARS = 4_000;

export type ExecResult =
	| {
			readonly type: "exited";
			readonly stdout: string;
			readonly stderr: string;
			readonly code: number | null;
			readonly signal: string | null;
	  }
	| {
			readonly type: "spawn-failed";
			readonly stdout: string;
			readonly stderr: string;
			readonly error: string;
	  }
	| {
			readonly type: "cancelled";
			readonly stdout: string;
			readonly stderr: string;
			readonly code: number | null;
			readonly signal: string | null;
	  }
	| {
			readonly type: "timed-out";
			readonly stdout: string;
			readonly stderr: string;
			readonly code: number | null;
			readonly signal: string | null;
	  };

export type ExecOutputStream = "stdout" | "stderr";
export type ExecOutputListener = (stream: ExecOutputStream, text: string) => void;

export interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
	terminationKillGraceMs?: number;
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

/** ns's command execution gateway. */
export interface CommandExecApi {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

/**
 * A CommandExecApi whose implementation actually pipes `options.stdin` to the child process.
 * Code that drives stdin-consuming commands must require this capability explicitly.
 */
export interface StdinCapableCommandExecApi extends CommandExecApi {
	readonly supportsStdin: true;
}

export function execApiToCommandRunner(execApi: CommandExecApi): CommandRunner {
	return async (command, args, options) => await execApi.exec(command, [...args], options);
}

export interface TailTextOptions {
	maxChars: number;
	maxLines?: number;
}

export type CommandResolver = (name: string) => string | undefined;

const NS_COMMAND_SEGMENT_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export function nsCommandSurface(extensionId: string, action: string): string {
	assertValidNsCommandPart(extensionId, "extension id");
	for (const segment of action.split(":")) {
		assertValidNsCommandPart(segment, "action segment");
	}
	return `ns:${extensionId}:${action}`;
}

function assertValidNsCommandPart(value: string, label: string): void {
	if (!NS_COMMAND_SEGMENT_PATTERN.test(value)) {
		throw new Error(
			`Invalid ns command surface ${label}: ${JSON.stringify(value)}. Expected lowercase kebab-case without slashes or colons.`,
		);
	}
}

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

export function commandSucceeded(result: ExecResult): boolean {
	switch (result.type) {
		case "exited":
			return result.code === 0 && result.signal === null;
		case "spawn-failed":
		case "cancelled":
		case "timed-out":
			return false;
	}
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
		`Termination: ${commandTerminationSummary(options.result)}`,
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
	if (stderr !== "") return stderr;
	return commandTerminationSummary(result);
}

export function formatCommandError(summary: string, result: ExecResult): string {
	return [summary, formatCommandDetails(result)].join("\n");
}

export function formatCommandDetails(result: ExecResult): string {
	const details = firstNonEmptyTrimmed(result.stderr, result.stdout);
	const status = commandTerminationSummary(result);
	return details === "" ? status : `${status}: ${details}`;
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
	switch (result.type) {
		case "spawn-failed":
			return formatCommandSpawnFailure(title, displayCommand, result.error);
		case "exited":
		case "cancelled":
		case "timed-out":
			return formatCommandFailure(title, displayCommand, result);
	}
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
	const status = commandTerminationSummary(result);
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

export function formatCommandSpawnFailure(
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

function commandTerminationSummary(result: ExecResult): string {
	switch (result.type) {
		case "exited":
			return closeEvidence(`exit code ${result.code ?? "unknown"}`, result.signal);
		case "spawn-failed":
			return `spawn failed: ${result.error}`;
		case "cancelled":
			return closeEvidence("cancelled", result.signal);
		case "timed-out":
			return closeEvidence("timed out", result.signal);
	}
}

function closeEvidence(summary: string, signal: string | null): string {
	return signal === null ? summary : `${summary}; signal ${signal}`;
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

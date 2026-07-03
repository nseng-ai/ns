import { type ExecResult, tailText } from "@ji/core/exec";
import { isRecord } from "@ji/core/primitives";
export { err, ok, resultErr, resultOk } from "@ji/core/result";
export type { ErrorInfo, Result, Result as GatewayResult } from "@ji/core/result";
import type { ErrorInfo } from "@ji/core/result";
import { stripTerminalEscapes } from "@ji/core/terminal-escapes";

const STDERR_DETAIL_LIMIT_CHARS = 1_200;
const CONCISE_COMMAND_FAILURE_DETAIL_LIMIT_CHARS = 300;

export interface CommandFailureOptions {
	command: string;
	args: readonly string[];
	result: ExecResult;
	code: string;
	message: string;
}

export function commandFailure(options: CommandFailureOptions): ErrorInfo | undefined {
	const { command, args, result, code, message } = options;
	if (result.code === 0 && !result.killed) {
		return undefined;
	}

	const details: Record<string, unknown> = {
		command,
		args: [...args],
		exit_code: result.code,
	};
	if (result.startupError !== undefined) {
		details.startup_error = result.startupError;
	}
	const stderr = tailText(result.stderr.trim(), { maxChars: STDERR_DETAIL_LIMIT_CHARS });
	if (stderr !== "") {
		details.stderr = stderr;
	}

	return { code, message, details };
}

export function formatCommandFailureConciseCause(error: ErrorInfo | undefined): string | undefined {
	const details = commandFailureDetails(error);
	if (details === undefined) return undefined;

	const command = commandFailureLabel(error, details);
	const exitCode = detailNumber(details, "exit_code");
	const stderr = conciseDiagnosticText(detailString(details, "stderr"));
	if (exitCode !== undefined && stderr !== undefined) {
		return `${command} exited ${exitCode}: ${stderr}`;
	}

	const startupError = conciseDiagnosticText(detailString(details, "startup_error"));
	if (startupError !== undefined) return `${command} startup failed: ${startupError}`;

	return undefined;
}

export function formatErrorInfoDiagnosticLines(error: ErrorInfo): string[] {
	const lines = [`code: ${error.code}`, `message: ${error.message}`];
	if (error.displayCommand !== undefined) {
		lines.push(`display_command: ${error.displayCommand}`);
	}
	const details = errorInfoDetails(error);
	if (details !== undefined) {
		for (const key of Object.keys(details).sort()) {
			lines.push(`${key}: ${formatDiagnosticDetail(details[key])}`);
		}
	}
	return lines;
}

function commandFailureDetails(error: ErrorInfo | undefined): Record<string, unknown> | undefined {
	const details = errorInfoDetails(error);
	if (details === undefined) return undefined;
	if (detailString(details, "command") === undefined) return undefined;
	return details;
}

function errorInfoDetails(error: ErrorInfo | undefined): Record<string, unknown> | undefined {
	const details = error?.details;
	return isRecord(details) ? details : undefined;
}

function commandFailureLabel(
	error: ErrorInfo | undefined,
	details: Record<string, unknown>,
): string {
	if (error?.displayCommand !== undefined && error.displayCommand.trim() !== "") {
		return error.displayCommand.trim();
	}
	return detailString(details, "command") ?? "command";
}

function detailString(details: Record<string, unknown>, key: string): string | undefined {
	const value = details[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function detailNumber(details: Record<string, unknown>, key: string): number | undefined {
	const value = details[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function conciseDiagnosticText(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const normalized = stripTerminalEscapes(value).replace(/\s+/gu, " ").trim();
	if (normalized === "") return undefined;
	if (normalized.length <= CONCISE_COMMAND_FAILURE_DETAIL_LIMIT_CHARS) return normalized;
	return `${normalized.slice(0, CONCISE_COMMAND_FAILURE_DETAIL_LIMIT_CHARS - 1).trimEnd()}…`;
}

function formatDiagnosticDetail(value: unknown): string {
	if (Array.isArray(value)) return value.map(formatDiagnosticDetailAtom).join(" ");
	return formatDiagnosticDetailAtom(value);
}

function formatDiagnosticDetailAtom(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null) return "null";
	return JSON.stringify(value);
}

import { formatCommand, tailText, type ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import { formatErrorMessage, isRecord, stringField } from "./primitives.ts";

const CMUX_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

export interface CmuxExecHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
}

export interface CmuxCallerContext {
	workspaceId: string;
	paneId: string;
	windowId?: string;
}

export interface CmuxCreatedSurface {
	surfaceId: string;
	workspaceId?: string;
}

export interface CmuxTabOptions {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	tabTitle: string;
	signal: AbortSignal | undefined;
}

export interface CmuxSendOptions {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	text: string;
	signal: AbortSignal | undefined;
}

interface CmuxExecOptions {
	cwd: string;
	timeout: number;
	signal?: AbortSignal;
}

export async function identifyCmuxCaller(
	host: CmuxExecHost,
	cwd: string,
): Promise<{ type: "identified"; caller: CmuxCallerContext } | { type: "failed"; message: string }> {
	const commandArgs = ["identify", "--json", "--id-format", "both"];
	let result: ExecResult;
	try {
		result = await host.exec("cmux", commandArgs, { cwd, timeout: CMUX_TIMEOUT_MS });
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", commandArgs), result) };
	}

	const parsed = parseCmuxCallerContext(result.stdout);
	if (parsed === undefined) {
		return { type: "failed", message: "cmux identify did not return a caller workspace and pane; are you running inside cmux?" };
	}
	return { type: "identified", caller: parsed };
}

export function parseCmuxCallerContext(stdout: string): CmuxCallerContext | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isRecord(parsed.caller)) {
		return undefined;
	}
	const workspaceId = stringField(parsed.caller, "workspace_id");
	const paneId = stringField(parsed.caller, "pane_id");
	if (workspaceId === undefined || paneId === undefined) {
		return undefined;
	}
	const windowId = stringField(parsed.caller, "window_id");
	return windowId === undefined ? { workspaceId, paneId } : { workspaceId, paneId, windowId };
}

export interface CreateCmuxSurfaceOptions {
	host: CmuxExecHost;
	cwd: string;
	caller: CmuxCallerContext;
	signal: AbortSignal | undefined;
}

export async function createCmuxSurface(options: CreateCmuxSurfaceOptions): Promise<{ type: "created"; surface: CmuxCreatedSurface } | { type: "failed"; message: string }> {
	const commandArgs = [
		"--json",
		"new-surface",
		"--type",
		"terminal",
		"--workspace",
		options.caller.workspaceId,
		"--pane",
		options.caller.paneId,
		"--focus",
		"true",
	];
	if (options.caller.windowId !== undefined) {
		commandArgs.push("--window", options.caller.windowId);
	}

	let result: ExecResult;
	try {
		result = await options.host.exec("cmux", commandArgs, cmuxExecOptions(options.cwd, options.signal));
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", commandArgs), result) };
	}
	const surface = parseCreatedCmuxSurface(result.stdout);
	if (surface === undefined) {
		return { type: "failed", message: "cmux new-surface did not return a surface identifier; no launch command was sent." };
	}
	return { type: "created", surface };
}

export function parseCreatedCmuxSurface(stdout: string): CmuxCreatedSurface | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) {
		return undefined;
	}
	const surfaceId = stringField(parsed, "surface_id") ?? stringField(parsed, "surface_ref") ?? stringField(parsed, "id");
	if (surfaceId === undefined) {
		return undefined;
	}
	const workspaceId = stringField(parsed, "workspace_id") ?? stringField(parsed, "workspace_ref");
	return workspaceId === undefined ? { surfaceId } : { surfaceId, workspaceId };
}

export async function renameCmuxTab(
	host: CmuxExecHost,
	cwd: string,
	options: CmuxTabOptions,
): Promise<{ type: "renamed" } | { type: "failed"; message: string }> {
	const commandArgs = [
		"rename-tab",
		"--workspace",
		options.workspaceId,
		"--surface",
		options.surfaceId,
		"--title",
		options.tabTitle,
	];
	if (options.windowId !== undefined) {
		commandArgs.push("--window", options.windowId);
	}
	return runCmuxMutation({ host, cwd, commandArgs, signal: options.signal, successType: "renamed" });
}

export async function sendCmuxText(
	host: CmuxExecHost,
	cwd: string,
	options: CmuxSendOptions,
): Promise<{ type: "sent" } | { type: "failed"; message: string }> {
	const commandArgs = ["send", "--workspace", options.workspaceId, "--surface", options.surfaceId];
	if (options.windowId !== undefined) {
		commandArgs.push("--window", options.windowId);
	}
	commandArgs.push("--", options.text);
	return runCmuxMutation({ host, cwd, commandArgs, signal: options.signal, successType: "sent" });
}

interface RunCmuxMutationOptions<TType extends "renamed" | "sent"> {
	host: CmuxExecHost;
	cwd: string;
	commandArgs: string[];
	signal: AbortSignal | undefined;
	successType: TType;
}

async function runCmuxMutation<TType extends "renamed" | "sent">(options: RunCmuxMutationOptions<TType>): Promise<{ type: TType } | { type: "failed"; message: string }> {
	let result: ExecResult;
	try {
		result = await options.host.exec("cmux", options.commandArgs, cmuxExecOptions(options.cwd, options.signal));
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", options.commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", options.commandArgs), result) };
	}
	return { type: options.successType };
}

function cmuxExecOptions(cwd: string, signal: AbortSignal | undefined): CmuxExecOptions {
	return signal === undefined ? { cwd, timeout: CMUX_TIMEOUT_MS } : { cwd, timeout: CMUX_TIMEOUT_MS, signal };
}

function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const trimmedStdout = result.stdout.trimEnd();
	const trimmedStderr = result.stderr.trimEnd();
	const stdout = trimmedStdout.length === 0 ? "(empty)" : trimmedStdout;
	const stderr = trimmedStderr.length === 0 ? "(empty)" : trimmedStderr;
	return truncateError(`command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`);
}

function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return truncateError(`command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${formatErrorMessage(error)}`);
}

function truncateError(message: string): string {
	return tailText(message, { maxChars: MAX_ERROR_CHARS });
}

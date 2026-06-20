import {
	cmuxCommandExecApi,
	formatCmuxCommandFailure,
	runCmuxCommand,
	type CmuxCommandExecHost,
} from "./command.ts";
import { isRecord, stringField } from "./primitives.ts";

const CMUX_TIMEOUT_MS = 10_000;

export type CmuxExecHost = CmuxCommandExecHost;

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

export async function identifyCmuxCaller(
	host: CmuxExecHost,
	cwd: string,
): Promise<
	{ type: "identified"; caller: CmuxCallerContext } | { type: "failed"; message: string }
> {
	const commandArgs = ["identify", "--json", "--id-format", "both"];
	const result = await runFocusedCmuxCommand({ host, cwd, commandArgs });
	if (result.type === "failed") {
		return {
			type: "failed",
			message: formatCmuxCommandFailure(result.failure),
		};
	}

	const parsed = parseCmuxCallerContext(result.result.stdout);
	if (parsed === undefined) {
		return {
			type: "failed",
			message:
				"cmux identify did not return a caller workspace and pane; are you running inside cmux?",
		};
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

export async function createCmuxSurface(
	options: CreateCmuxSurfaceOptions,
): Promise<{ type: "created"; surface: CmuxCreatedSurface } | { type: "failed"; message: string }> {
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

	const result = await runFocusedCmuxCommand({
		host: options.host,
		cwd: options.cwd,
		commandArgs,
		signal: options.signal,
	});
	if (result.type === "failed") {
		return {
			type: "failed",
			message: formatCmuxCommandFailure(result.failure),
		};
	}
	const surface = parseCreatedCmuxSurface(result.result.stdout);
	if (surface === undefined) {
		return {
			type: "failed",
			message: "cmux new-surface did not return a surface identifier; no launch command was sent.",
		};
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
	const surfaceId =
		stringField(parsed, "surface_id") ??
		stringField(parsed, "surface_ref") ??
		stringField(parsed, "id");
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
	return runCmuxMutation({
		host,
		cwd,
		commandArgs,
		signal: options.signal,
		successType: "renamed",
	});
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

export type CmuxTabLaunchStage = "identify" | "create-surface" | "rename" | "send";

export interface LaunchFocusedCmuxTabOptions {
	host: CmuxExecHost;
	cwd: string;
	tabTitle: string;
	command: string;
	signal: AbortSignal | undefined;
	onStage?: (stage: CmuxTabLaunchStage) => void;
}

export type FocusedCmuxTabLaunchResult =
	| { type: "launched"; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; surfaceId?: string; workspaceId?: string };

export async function launchFocusedCmuxTab(
	options: LaunchFocusedCmuxTabOptions,
): Promise<FocusedCmuxTabLaunchResult> {
	const { host, cwd, tabTitle, command, signal } = options;

	options.onStage?.("identify");
	const identified = await identifyCmuxCaller(host, cwd);
	if (identified.type === "failed") {
		return { type: "failed", message: identified.message };
	}

	options.onStage?.("create-surface");
	const created = await createCmuxSurface({ host, cwd, caller: identified.caller, signal });
	if (created.type === "failed") {
		return { type: "failed", message: created.message };
	}

	const surfaceId = created.surface.surfaceId;
	const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
	const windowIdEntry =
		identified.caller.windowId === undefined ? {} : { windowId: identified.caller.windowId };
	const recoveryMessage = (failureMessage: string): string =>
		`${failureMessage}\n\nCreated cmux surface: ${surfaceId}\nManual recovery: run ${command}`;

	options.onStage?.("rename");
	const renamed = await renameCmuxTab(host, cwd, {
		workspaceId,
		surfaceId,
		tabTitle,
		signal,
		...windowIdEntry,
	});
	if (renamed.type === "failed") {
		return { type: "failed", surfaceId, workspaceId, message: recoveryMessage(renamed.message) };
	}

	options.onStage?.("send");
	const sent = await sendCmuxText(host, cwd, {
		workspaceId,
		surfaceId,
		text: `${command}\n`,
		signal,
		...windowIdEntry,
	});
	if (sent.type === "failed") {
		return { type: "failed", surfaceId, workspaceId, message: recoveryMessage(sent.message) };
	}

	return { type: "launched", tabTitle, surfaceId, workspaceId, command };
}

interface RunCmuxMutationOptions<TType extends "renamed" | "sent"> {
	host: CmuxExecHost;
	cwd: string;
	commandArgs: string[];
	signal: AbortSignal | undefined;
	successType: TType;
}

async function runCmuxMutation<TType extends "renamed" | "sent">(
	options: RunCmuxMutationOptions<TType>,
): Promise<{ type: TType } | { type: "failed"; message: string }> {
	const result = await runFocusedCmuxCommand({
		host: options.host,
		cwd: options.cwd,
		commandArgs: options.commandArgs,
		signal: options.signal,
	});
	if (result.type === "failed") {
		return { type: "failed", message: formatCmuxCommandFailure(result.failure) };
	}
	return { type: options.successType };
}

interface RunFocusedCmuxCommandOptions {
	host: CmuxExecHost;
	cwd: string;
	commandArgs: readonly string[];
	signal?: AbortSignal | undefined;
}

async function runFocusedCmuxCommand(options: RunFocusedCmuxCommandOptions) {
	return await runCmuxCommand({
		commands: cmuxCommandExecApi(options.host),
		args: options.commandArgs,
		cwd: options.cwd,
		timeoutMs: CMUX_TIMEOUT_MS,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

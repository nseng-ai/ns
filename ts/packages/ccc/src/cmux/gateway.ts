import type { CommandExecApi } from "@asdl/core/exec";
import { formatCmuxCommandFailure, runCmuxCommand, type CmuxCommandFailure } from "./command.ts";
import { isRecord, stringField } from "./primitives.ts";

export const DEFAULT_CMUX_OPERATION_TIMEOUT_MS = 10_000;

export type CmuxOperation =
	| "identify-caller"
	| "create-terminal-surface"
	| "rename-tab"
	| "send-text"
	| "open-workspace"
	| "rename-workspace"
	| "set-workspace-description"
	| "clear-status";

export type CmuxResult<T> =
	| { type: "success"; value: T }
	| { type: "failed"; failure: CmuxGatewayFailure };

export interface CmuxGatewayFailure {
	operation: CmuxOperation;
	message: string;
	commandFailure?: CmuxCommandFailure;
	parseError?: string;
}

export interface CmuxGateway {
	identifyCaller(params: IdentifyCmuxCallerParams): Promise<CmuxResult<CmuxCallerContext>>;
	createTerminalSurface(
		params: CreateCmuxTerminalSurfaceParams,
	): Promise<CmuxResult<CmuxCreatedSurface>>;
	renameTab(params: RenameCmuxTabParams): Promise<CmuxResult<void>>;
	sendText(params: SendCmuxTextParams): Promise<CmuxResult<void>>;
	openWorkspace(params: OpenCmuxWorkspaceParams): Promise<CmuxResult<void>>;
	renameWorkspace(params: RenameCmuxWorkspaceParams): Promise<CmuxResult<void>>;
	setWorkspaceDescription(params: SetCmuxWorkspaceDescriptionParams): Promise<CmuxResult<void>>;
	clearStatus(params: ClearCmuxStatusParams): Promise<CmuxResult<void>>;
}

export interface CmuxCommandContext {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
	timeoutMs?: number;
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

export interface IdentifyCmuxCallerParams extends CmuxCommandContext {}

export interface CreateCmuxTerminalSurfaceParams extends CmuxCommandContext {
	caller: CmuxCallerContext;
}

export interface RenameCmuxTabParams extends CmuxCommandContext {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	title: string;
}

export interface SendCmuxTextParams extends CmuxCommandContext {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	text: string;
}

export interface OpenCmuxWorkspaceParams extends CmuxCommandContext {
	name: string;
	description: string;
	workspaceCwd: string;
	command?: string;
}

export interface RenameCmuxWorkspaceParams extends CmuxCommandContext {
	workspace: string;
	title: string;
}

export interface SetCmuxWorkspaceDescriptionParams extends CmuxCommandContext {
	workspace: string;
	description: string;
}

export interface ClearCmuxStatusParams extends CmuxCommandContext {
	workspace: string;
	statusKey: string;
}

export class RealCmuxGateway implements CmuxGateway {
	private readonly commands: CommandExecApi;

	constructor(commands: CommandExecApi) {
		this.commands = commands;
	}

	async identifyCaller(params: IdentifyCmuxCallerParams): Promise<CmuxResult<CmuxCallerContext>> {
		const result = await this.run("identify-caller", params, [
			"identify",
			"--json",
			"--id-format",
			"both",
		]);
		if (result.type === "failed") return result;

		const caller = parseCmuxCallerContext(result.value.stdout);
		if (caller === undefined) {
			return parseFailure(
				"identify-caller",
				"cmux identify did not return a caller workspace and pane; are you running inside cmux?",
			);
		}
		return { type: "success", value: caller };
	}

	async createTerminalSurface(
		params: CreateCmuxTerminalSurfaceParams,
	): Promise<CmuxResult<CmuxCreatedSurface>> {
		const args = [
			"--json",
			"new-surface",
			"--type",
			"terminal",
			"--workspace",
			params.caller.workspaceId,
			"--pane",
			params.caller.paneId,
			"--focus",
			"true",
		];
		if (params.caller.windowId !== undefined) {
			args.push("--window", params.caller.windowId);
		}

		const result = await this.run("create-terminal-surface", params, args);
		if (result.type === "failed") return result;

		const surface = parseCreatedCmuxSurface(result.value.stdout);
		if (surface === undefined) {
			return parseFailure(
				"create-terminal-surface",
				"cmux new-surface did not return a surface identifier; no launch command was sent.",
			);
		}
		return { type: "success", value: surface };
	}

	async renameTab(params: RenameCmuxTabParams): Promise<CmuxResult<void>> {
		const args = [
			"rename-tab",
			"--workspace",
			params.workspaceId,
			"--surface",
			params.surfaceId,
			"--title",
			params.title,
		];
		if (params.windowId !== undefined) {
			args.push("--window", params.windowId);
		}
		return await this.runMutation("rename-tab", params, args);
	}

	async sendText(params: SendCmuxTextParams): Promise<CmuxResult<void>> {
		const args = ["send", "--workspace", params.workspaceId, "--surface", params.surfaceId];
		if (params.windowId !== undefined) {
			args.push("--window", params.windowId);
		}
		args.push("--", params.text);
		return await this.runMutation("send-text", params, args);
	}

	async openWorkspace(params: OpenCmuxWorkspaceParams): Promise<CmuxResult<void>> {
		const args = [
			"new-workspace",
			"--name",
			params.name,
			"--description",
			params.description,
			"--cwd",
			params.workspaceCwd,
		];
		if (params.command !== undefined) {
			args.push("--command", params.command);
		}
		return await this.runMutation("open-workspace", params, args);
	}

	async renameWorkspace(params: RenameCmuxWorkspaceParams): Promise<CmuxResult<void>> {
		return await this.runMutation("rename-workspace", params, [
			"workspace",
			"rename",
			params.workspace,
			"--title",
			params.title,
		]);
	}

	async setWorkspaceDescription(
		params: SetCmuxWorkspaceDescriptionParams,
	): Promise<CmuxResult<void>> {
		return await this.runMutation("set-workspace-description", params, [
			"workspace-action",
			"--workspace",
			params.workspace,
			"--action",
			"set-description",
			"--description",
			params.description,
		]);
	}

	async clearStatus(params: ClearCmuxStatusParams): Promise<CmuxResult<void>> {
		return await this.runMutation("clear-status", params, [
			"clear-status",
			params.statusKey,
			"--workspace",
			params.workspace,
		]);
	}

	private async runMutation(
		operation: CmuxOperation,
		context: CmuxCommandContext,
		args: readonly string[],
	): Promise<CmuxResult<void>> {
		const result = await this.run(operation, context, args);
		if (result.type === "failed") return result;
		return { type: "success", value: undefined };
	}

	private async run(
		operation: CmuxOperation,
		context: CmuxCommandContext,
		args: readonly string[],
	): Promise<CmuxResult<{ stdout: string }>> {
		const result = await runCmuxCommand({
			commands: this.commands,
			args,
			cwd: context.cwd,
			timeoutMs: context.timeoutMs ?? DEFAULT_CMUX_OPERATION_TIMEOUT_MS,
			...(context.env === undefined ? {} : { env: context.env }),
			...(context.signal === undefined ? {} : { signal: context.signal }),
		});
		if (result.type === "failed") {
			return {
				type: "failed",
				failure: commandFailure(operation, result.failure),
			};
		}
		return { type: "success", value: { stdout: result.result.stdout } };
	}
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

function commandFailure(operation: CmuxOperation, failure: CmuxCommandFailure): CmuxGatewayFailure {
	return {
		operation,
		message: formatCmuxCommandFailure(failure),
		commandFailure: failure,
	};
}

function parseFailure(operation: CmuxOperation, message: string): CmuxResult<never> {
	return {
		type: "failed",
		failure: {
			operation,
			message,
			parseError: message,
		},
	};
}

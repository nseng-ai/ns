import { cmuxCommandExecApi, type CmuxCommandExecHost } from "./command.ts";
import {
	RealCmuxGateway,
	parseCmuxCallerContext,
	parseCreatedCmuxSurface,
	type CmuxCallerContext,
	type CmuxCreatedSurface,
	type CmuxGateway,
} from "./gateway.ts";

export type CmuxExecHost = CmuxCommandExecHost;
export type { CmuxCallerContext, CmuxCreatedSurface };
export { parseCmuxCallerContext, parseCreatedCmuxSurface };

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
	const gateway = createRealCmuxGateway(host);
	const result = await gateway.identifyCaller({ cwd });
	if (result.type === "failed") return { type: "failed", message: result.failure.message };
	return { type: "identified", caller: result.value };
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
	const gateway = createRealCmuxGateway(options.host);
	const result = await gateway.createTerminalSurface({
		cwd: options.cwd,
		caller: options.caller,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.type === "failed") return { type: "failed", message: result.failure.message };
	return { type: "created", surface: result.value };
}

export async function renameCmuxTab(
	host: CmuxExecHost,
	cwd: string,
	options: CmuxTabOptions,
): Promise<{ type: "renamed" } | { type: "failed"; message: string }> {
	const gateway = createRealCmuxGateway(host);
	const result = await gateway.renameTab({
		cwd,
		workspaceId: options.workspaceId,
		surfaceId: options.surfaceId,
		title: options.tabTitle,
		...(options.windowId === undefined ? {} : { windowId: options.windowId }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.type === "failed") return { type: "failed", message: result.failure.message };
	return { type: "renamed" };
}

export async function sendCmuxText(
	host: CmuxExecHost,
	cwd: string,
	options: CmuxSendOptions,
): Promise<{ type: "sent" } | { type: "failed"; message: string }> {
	const gateway = createRealCmuxGateway(host);
	const result = await gateway.sendText({
		cwd,
		workspaceId: options.workspaceId,
		surfaceId: options.surfaceId,
		text: options.text,
		...(options.windowId === undefined ? {} : { windowId: options.windowId }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.type === "failed") return { type: "failed", message: result.failure.message };
	return { type: "sent" };
}

export type CmuxTabLaunchStage = "identify" | "create-surface" | "rename" | "send";

export interface LaunchFocusedCmuxTabOptions {
	host: CmuxExecHost;
	cwd: string;
	tabTitle: string;
	command: string;
	signal: AbortSignal | undefined;
	onStage?: (stage: CmuxTabLaunchStage) => void;
	gateway?: CmuxGateway;
}

export type FocusedCmuxTabLaunchResult =
	| { type: "launched"; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; surfaceId?: string; workspaceId?: string };

export async function launchFocusedCmuxTab(
	options: LaunchFocusedCmuxTabOptions,
): Promise<FocusedCmuxTabLaunchResult> {
	const { host, cwd, tabTitle, command, signal } = options;
	const gateway = options.gateway ?? createRealCmuxGateway(host);

	options.onStage?.("identify");
	const identified = await gateway.identifyCaller({ cwd });
	if (identified.type === "failed") {
		return { type: "failed", message: identified.failure.message };
	}

	options.onStage?.("create-surface");
	const created = await gateway.createTerminalSurface({
		cwd,
		caller: identified.value,
		...(signal === undefined ? {} : { signal }),
	});
	if (created.type === "failed") {
		return { type: "failed", message: created.failure.message };
	}

	const surfaceId = created.value.surfaceId;
	const workspaceId = created.value.workspaceId ?? identified.value.workspaceId;
	const windowIdEntry =
		identified.value.windowId === undefined ? {} : { windowId: identified.value.windowId };
	const recoveryMessage = (failureMessage: string): string =>
		`${failureMessage}\n\nCreated cmux surface: ${surfaceId}\nManual recovery: run ${command}`;

	options.onStage?.("rename");
	const renamed = await gateway.renameTab({
		cwd,
		workspaceId,
		surfaceId,
		title: tabTitle,
		...(signal === undefined ? {} : { signal }),
		...windowIdEntry,
	});
	if (renamed.type === "failed") {
		return {
			type: "failed",
			surfaceId,
			workspaceId,
			message: recoveryMessage(renamed.failure.message),
		};
	}

	options.onStage?.("send");
	const sent = await gateway.sendText({
		cwd,
		workspaceId,
		surfaceId,
		text: `${command}\n`,
		...(signal === undefined ? {} : { signal }),
		...windowIdEntry,
	});
	if (sent.type === "failed") {
		return {
			type: "failed",
			surfaceId,
			workspaceId,
			message: recoveryMessage(sent.failure.message),
		};
	}

	return { type: "launched", tabTitle, surfaceId, workspaceId, command };
}

function createRealCmuxGateway(host: CmuxExecHost): CmuxGateway {
	return new RealCmuxGateway(cmuxCommandExecApi(host));
}

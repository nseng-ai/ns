import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { cmuxCommandExecApi, type CmuxCommandExecHost } from "./command.ts";
import {
	RealCmuxGateway,
	parseCmuxCallerContext,
	parseCreatedCmuxSurface,
	type CmuxCallerContext,
	type CmuxCreatedSurface,
	type CmuxGateway,
} from "./gateway.ts";

// Neutral focused-tab orchestration: depend only on cmux command/gateway seams, not Pi host APIs.
export type CmuxExecHost = CmuxCommandExecHost;
export type { CmuxCallerContext, CmuxCreatedSurface };
export { parseCmuxCallerContext, parseCreatedCmuxSurface };

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

export type CmuxTabLaunchStage = "identify" | "create-surface" | "rename" | "send";

export interface LaunchFocusedCmuxTabOptions {
	host: CmuxExecHost;
	cwd: string;
	tabTitle: string;
	command: string;
	signal: AbortSignal | undefined;
	shouldFocus?: boolean;
	onStage?: (stage: CmuxTabLaunchStage) => void;
	gateway?: CmuxGateway;
}

export type FocusedCmuxTabLaunchResult =
	| { type: "launched"; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; surfaceId?: string; workspaceId?: string };

export async function launchFocusedCmuxTab(
	options: LaunchFocusedCmuxTabOptions,
): Promise<FocusedCmuxTabLaunchResult> {
	const { host, cwd, tabTitle, command, signal, shouldFocus } = options;
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
		...optionalEntry("signal", signal),
		...optionalEntry("shouldFocus", shouldFocus),
	});
	if (created.type === "failed") {
		return { type: "failed", message: created.failure.message };
	}

	const surfaceId = created.value.surfaceId;
	const workspaceId = created.value.workspaceId ?? identified.value.workspaceId;
	const windowIdEntry = optionalEntry("windowId", identified.value.windowId);
	const recoveryMessage = (failureMessage: string): string =>
		`${failureMessage}\n\nCreated cmux surface: ${surfaceId}\nManual recovery: run ${command}`;

	options.onStage?.("rename");
	const renamed = await gateway.renameTab({
		cwd,
		workspaceId,
		surfaceId,
		title: tabTitle,
		...optionalEntry("signal", signal),
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
		...optionalEntry("signal", signal),
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

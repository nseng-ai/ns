import { buildPiLaunchCommand, getPiLaunchOptions } from "./cmux/pi-launch.ts";
import {
	createCmuxSurface,
	identifyCmuxCaller,
	renameCmuxTab,
	sendCmuxText,
	type CmuxSendOptions,
	type CmuxTabOptions,
} from "./cmux/focused-terminal-tab.ts";
import { setLaunchStatus, type LaunchStatusUi } from "./launch-status.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import type { ModelInfo, ThinkingLevel } from "./cmux/types.ts";

export interface HandoffTabLaunchParams {
	branch: string;
	slug: string;
	key: string;
	pickupCommand: string;
}

export type HandoffExistsResult = { type: "exists" } | { type: "missing" } | { type: "failed"; message: string };

export type HandoffTabLaunchResult =
	| { type: "launched"; branch: string; slug: string; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; branch?: string; slug?: string; surfaceId?: string; workspaceId?: string };

export interface HandoffTabLaunchHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
	getThinkingLevel?(): ThinkingLevel;
}

export interface HandoffTabLaunchUpdate {
	content: Array<{ type: "text"; text: string }>;
}

export interface HandoffTabLaunchOptions {
	host: HandoffTabLaunchHost;
	cwd: string;
	model: ModelInfo | undefined;
	hasUI: boolean;
	ui: LaunchStatusUi;
	statusKey: string;
	params: HandoffTabLaunchParams;
	signal: AbortSignal | undefined;
	onUpdate: ((update: HandoffTabLaunchUpdate) => void) | undefined;
	checkHandoffExists(branch: string, key: string): Promise<HandoffExistsResult>;
}

export async function launchHandoffTab(options: HandoffTabLaunchOptions): Promise<HandoffTabLaunchResult> {
	updateProgress(options, "Verifying saved handoff…", "verifying saved handoff…");
	try {
		const exists = await options.checkHandoffExists(options.params.branch, options.params.key);
		if (exists.type === "missing") {
			return {
				type: "failed",
				branch: options.params.branch,
				slug: options.params.slug,
				message: `No handoff ${options.params.slug} found on branch ${options.params.branch}; no cmux tab was opened.`,
			};
		}
		if (exists.type === "failed") {
			return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: exists.message };
		}

		updateProgress(options, "Resolving cmux caller context…", "resolving cmux caller…");
		const identified = await identifyCmuxCaller(options.host, options.cwd);
		if (identified.type === "failed") {
			return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: identified.message };
		}

		updateProgress(options, "Creating focused cmux tab…", "creating cmux tab…");
		const created = await createCmuxSurface({ host: options.host, cwd: options.cwd, caller: identified.caller, signal: options.signal });
		if (created.type === "failed") {
			return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: created.message };
		}

		const tabTitle = `handoff: ${options.params.slug}`;
		const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
		const windowIdEntry = identified.caller.windowId === undefined ? {} : { windowId: identified.caller.windowId };
		updateProgress(options, "Naming cmux tab…", "naming cmux tab…");
		const renameOptions: CmuxTabOptions = {
			workspaceId,
			surfaceId: created.surface.surfaceId,
			tabTitle,
			signal: options.signal,
			...windowIdEntry,
		};
		const renamed = await renameCmuxTab(options.host, options.cwd, renameOptions);
		if (renamed.type === "failed") {
			return {
				type: "failed",
				branch: options.params.branch,
				slug: options.params.slug,
				surfaceId: created.surface.surfaceId,
				workspaceId,
				message: `${renamed.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: ${options.params.pickupCommand}`,
			};
		}

		const launchContext = options.model === undefined ? {} : { model: options.model };
		const thinkingLevelHost = {
			getThinkingLevel(): ThinkingLevel {
				return options.host.getThinkingLevel?.() ?? "medium";
			},
		};
		const command = buildPiLaunchCommand(options.params.pickupCommand, getPiLaunchOptions(thinkingLevelHost, launchContext));
		updateProgress(options, "Launching pickup Pi…", "launching pickup Pi…");
		const sendOptions: CmuxSendOptions = {
			workspaceId,
			surfaceId: created.surface.surfaceId,
			text: `${command}\n`,
			signal: options.signal,
			...windowIdEntry,
		};
		const sent = await sendCmuxText(options.host, options.cwd, sendOptions);
		if (sent.type === "failed") {
			return {
				type: "failed",
				branch: options.params.branch,
				slug: options.params.slug,
				surfaceId: created.surface.surfaceId,
				workspaceId,
				message: `${sent.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
			};
		}

		return {
			type: "launched",
			branch: options.params.branch,
			slug: options.params.slug,
			tabTitle,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			command,
		};
	} finally {
		setLaunchStatus(options, undefined);
	}
}

export function formatHandoffTabLaunchSuccess(result: Extract<HandoffTabLaunchResult, { type: "launched" }>): string {
	return [
		"Opened handoff pickup tab.",
		`Handoff: ${result.slug}`,
		`Branch: ${result.branch}`,
		`Tab title: ${result.tabTitle}`,
		`Surface: ${result.surfaceId}`,
		`Workspace: ${result.workspaceId}`,
		`Command: ${result.command}`,
	].join("\n");
}

function updateProgress(options: HandoffTabLaunchOptions, text: string, status: string): void {
	options.onUpdate?.({ content: [{ type: "text", text }] });
	setLaunchStatus(options, status);
}


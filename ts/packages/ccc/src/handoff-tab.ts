import { buildPiLaunchCommand, getPiLaunchOptions } from "./cmux/pi-launch.ts";
import { launchFocusedCmuxTab, type CmuxTabLaunchStage } from "./cmux/focused-terminal-tab.ts";
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

		const launchContext = options.model === undefined ? {} : { model: options.model };
		const thinkingLevelHost = {
			getThinkingLevel(): ThinkingLevel {
				return options.host.getThinkingLevel?.() ?? "medium";
			},
		};
		const command = buildPiLaunchCommand(options.params.pickupCommand, getPiLaunchOptions(thinkingLevelHost, launchContext));

		const launched = await launchFocusedCmuxTab({
			host: options.host,
			cwd: options.cwd,
			tabTitle: `handoff: ${options.params.slug}`,
			command,
			signal: options.signal,
			onStage: (stage) => {
				const progress = HANDOFF_STAGE_PROGRESS[stage];
				updateProgress(options, progress.text, progress.status);
			},
		});
		if (launched.type === "failed") {
			const locationEntry =
				launched.surfaceId === undefined || launched.workspaceId === undefined
					? {}
					: { surfaceId: launched.surfaceId, workspaceId: launched.workspaceId };
			return {
				type: "failed",
				branch: options.params.branch,
				slug: options.params.slug,
				...locationEntry,
				message: launched.message,
			};
		}

		return {
			type: "launched",
			branch: options.params.branch,
			slug: options.params.slug,
			tabTitle: launched.tabTitle,
			surfaceId: launched.surfaceId,
			workspaceId: launched.workspaceId,
			command: launched.command,
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

const HANDOFF_STAGE_PROGRESS: Record<CmuxTabLaunchStage, { text: string; status: string }> = {
	identify: { text: "Resolving cmux caller context…", status: "resolving cmux caller…" },
	"create-surface": { text: "Creating focused cmux tab…", status: "creating cmux tab…" },
	rename: { text: "Naming cmux tab…", status: "naming cmux tab…" },
	send: { text: "Launching pickup Pi…", status: "launching pickup Pi…" },
};

function updateProgress(options: HandoffTabLaunchOptions, text: string, status: string): void {
	options.onUpdate?.({ content: [{ type: "text", text }] });
	setLaunchStatus(options, status);
}


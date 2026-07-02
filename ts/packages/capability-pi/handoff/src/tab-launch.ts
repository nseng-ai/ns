import { buildPiLaunchCommand, getPiLaunchOptions } from "@sdl/capability-kit/cmux/pi-launch";
import {
	launchFocusedCmuxTab,
	type CmuxTabLaunchStage,
} from "@sdl/capability-kit/cmux/focused-terminal-tab";
import { setRuntimeStatus } from "@sdl/pi/runtime/status";
import type { HandoffLaunchParams } from "./launch-flow.ts";
import type { ExecResult, ModelInfo, ThinkingLevel } from "./runtime-types.ts";

export type HandoffTabLaunchResult =
	| {
			type: "launched";
			branch: string;
			slug: string;
			tabTitle: string;
			surfaceId: string;
			workspaceId: string;
			command: string;
	  }
	| {
			type: "failed";
			message: string;
			branch?: string;
			slug?: string;
			surfaceId?: string;
			workspaceId?: string;
	  };

export interface HandoffTabLaunchHost {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<ExecResult>;
	getThinkingLevel?(): ThinkingLevel;
}

export interface HandoffTabLaunchUpdate {
	content: Array<{ type: "text"; text: string }>;
}

export interface HandoffTabLaunchUi {
	setStatus?(key: string, value: string | undefined): void;
}

export interface HandoffTabLaunchOptions {
	host: HandoffTabLaunchHost;
	cwd: string;
	model: ModelInfo | undefined;
	hasUI: boolean;
	ui: HandoffTabLaunchUi;
	statusKey: string;
	params: HandoffLaunchParams;
	signal: AbortSignal | undefined;
	onUpdate: ((update: HandoffTabLaunchUpdate) => void) | undefined;
}

export async function launchHandoffTab(
	options: HandoffTabLaunchOptions,
): Promise<HandoffTabLaunchResult> {
	try {
		const launchContext = options.model === undefined ? {} : { model: options.model };
		const thinkingLevelHost = {
			getThinkingLevel(): ThinkingLevel {
				return options.host.getThinkingLevel?.() ?? "medium";
			},
		};
		const command = buildPiLaunchCommand(
			options.params.pickupCommand,
			getPiLaunchOptions(thinkingLevelHost, launchContext),
		);

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
		setRuntimeStatus(options, options.statusKey, undefined);
	}
}

export function formatHandoffTabLaunchSuccess(
	result: Extract<HandoffTabLaunchResult, { type: "launched" }>,
): string {
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
	setRuntimeStatus(options, options.statusKey, status);
}

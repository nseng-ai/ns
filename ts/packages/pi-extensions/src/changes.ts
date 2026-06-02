import { draftChangesSummary } from "./changes-model-summary.ts";
import { formatOutstandingChangesMessage, summarizePorcelainStatus } from "./changes-summary.ts";
import type { ExtensionCommandContext } from "./fast-text-draft.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "../../asdl-dev/src/pending-worktree.ts";
import { customMessageText, truncateDisplayLine, type CustomMessageContent } from "./terminal-presentation.ts";

const COMMAND_NAME = "code:changes";
export const CHANGES_SUMMARY_MESSAGE_TYPE = "code-changes-summary";

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

type RenderTheme = {
	fg(color: string, text: string): string;
	bold?(text: string): string;
};

type RenderComponent = {
	render(width: number): string[];
	invalidate(): void;
};

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export type CommandContext = ExtensionCommandContext;

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<WorktreeCommandResult>;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
};

type ChangesMessageDetails = {
	root: string;
	branch: string;
	statusSummary: ReturnType<typeof summarizePorcelainStatus>;
};

export default function changesExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(CHANGES_SUMMARY_MESSAGE_TYPE, renderChangesSummaryMessage);
	pi.registerCommand(COMMAND_NAME, {
		description: "Summarize outstanding worktree changes without committing",
		handler: async (_args, ctx) => {
			await showOutstandingChanges(pi, ctx);
		},
	});
}

export async function showOutstandingChanges(pi: Pick<ExtensionAPI, "exec" | "sendMessage">, ctx: CommandContext): Promise<boolean> {
	await ctx.waitForIdle();

	const loaded = await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		execGit: (args, timeout) => pi.exec("git", args, { cwd: ctx.cwd, timeout }),
	});
	if (!loaded.ok) {
		ctx.ui.notify(formatChangesSnapshotError(loaded.error), "error");
		return false;
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		ctx.ui.notify("Working tree is clean; no outstanding changes.", "info");
		return true;
	}

	const summary = await draftChangesSummary(pi, ctx, snapshot);
	if (!summary.ok) {
		ctx.ui.notify(summary.error, "error");
		return false;
	}

	const content = formatOutstandingChangesMessage({ snapshot, summaryText: summary.summaryText });
	emitChangesSummary(pi, ctx, snapshot, content);
	return true;
}

export function renderChangesSummaryMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	return {
		render(width: number): string[] {
			return content.split("\n").map((line, index) => styleChangesLine(truncateDisplayLine(line, width), index, theme));
		},
		invalidate(): void {},
	};
}

function emitChangesSummary(
	pi: Pick<ExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	snapshot: PendingWorktreeSnapshot,
	content: string,
): void {
	const details: ChangesMessageDetails = {
		root: snapshot.root,
		branch: snapshot.branch,
		statusSummary: summarizePorcelainStatus(snapshot.status),
	};
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: CHANGES_SUMMARY_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, "info");
}

function formatChangesSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Could not determine current branch.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not inspect git status.\n${details}`;
	}
	return `Could not capture git diff.\n${details}`;
}

function styleChangesLine(line: string, index: number, theme: RenderTheme): string {
	if (line.length === 0) return line;
	if (index === 0) {
		return theme.fg("accent", theme.bold !== undefined ? theme.bold(line) : line);
	}
	if (line === "Files:") {
		return theme.fg("muted", line);
	}
	if (isStatusDisplayLine(line)) {
		return theme.fg("dim", line);
	}
	return line;
}

function isStatusDisplayLine(line: string): boolean {
	return line.startsWith("...") || /^[ MADRCU?!]{2}\s/.test(line);
}

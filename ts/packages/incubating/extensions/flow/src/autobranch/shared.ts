import type { CommandResult } from "@nseng-ai/extension-kit/checkpoint-flow";

export type { CommandResult };
import { formatCommandDetails } from "@nseng-ai/foundation/command";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";

// Autobranch command execution is cwd-bound at the command/API boundary. Callers construct this
// function for exactly one worktree root and do not pass cwd separately through autobranch internals.
export type AutobranchExec = (
	command: string,
	args: string[],
	timeout: number,
) => Promise<CommandResult>;

export interface PendingWorktreeSnapshot {
	root: string;
	branch: string;
	status: string;
	diff: string;
	clean: boolean;
}

export function formatAutobranchCommandDetails(result: CommandResult): string {
	return formatCommandDetails(result);
}

export function truncateText(text: string, maxChars: number): string {
	const normalizedMaxChars = Math.max(0, Math.trunc(maxChars));
	if (text.length <= normalizedMaxChars) return text;
	if (normalizedMaxChars === 0) return "…";

	const marker = "\n…[truncated]";
	return truncateTextHead({
		value: `${text}${marker}`,
		maxChars: normalizedMaxChars + marker.length,
		buildMarker: () => marker,
		shouldTrimHead: false,
	});
}

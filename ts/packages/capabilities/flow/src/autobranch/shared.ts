import type { CommandResult } from "@nseng-ai/capability-kit/checkpoint-flow";

export type { CommandResult };
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
	const detail = result.stderr.trim() || result.stdout.trim();
	const status = autobranchTerminationStatus(result);
	return detail === "" ? status : `${status}: ${detail}`;
}

function autobranchTerminationStatus(result: CommandResult): string {
	switch (result.type) {
		case "spawn-failed":
			return `spawn failed: ${result.error}`;
		case "cancelled":
			return `cancelled (exit ${result.code})`;
		case "timed-out":
			return `timed out (exit ${result.code})`;
		case "exited":
			return result.signal === null
				? `exit ${result.code}`
				: `signal ${result.signal} (exit ${result.code})`;
	}
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

import type { CommandResult } from "@ji/capability-kit/checkpoint-flow";
import { formatCommandDetails } from "@ji/core/command";

export type { CommandResult };
import { truncateTextHead } from "@ji/core/text-truncation";

export type AutobranchExec = (
	command: string,
	args: string[],
	cwd: string,
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
	return formatCommandDetails({ ...result, killed: result.killed ?? false });
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

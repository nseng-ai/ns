import { formatCommandDetails, type ExecResult } from "@sdl/core/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: boolean;
};

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
	return `${text.slice(0, normalizedMaxChars)}\n…[truncated]`;
}

import { formatCommandDetails } from "@sdl/core/exec";

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

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
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

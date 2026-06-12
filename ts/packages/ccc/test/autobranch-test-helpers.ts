export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

export interface PendingWorktreeSnapshot {
	root: string;
	branch: string;
	status: string;
	diff: string;
	clean: boolean;
}

export type UpstreamMode = "contains" | "ahead" | "none" | "failed";

export function ok(stdout = "", stderr = ""): CommandResult {
	return { code: 0, stdout, stderr };
}

export function fail(stderr: string, code = 1): CommandResult {
	return { code, stdout: "", stderr };
}

export function eventIndex(events: string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
}

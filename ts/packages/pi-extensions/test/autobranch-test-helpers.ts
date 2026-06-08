import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";

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

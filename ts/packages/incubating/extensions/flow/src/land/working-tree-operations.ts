import type { WorkingTreeStatus } from "./types.ts";

export function operationInProgressLabel(
	operation: NonNullable<WorkingTreeStatus["inProgressOperation"]>,
): string {
	if (operation === "cherry-pick") return "A cherry-pick";
	if (operation === "bisect") return "A bisect";
	return `A ${operation}`;
}

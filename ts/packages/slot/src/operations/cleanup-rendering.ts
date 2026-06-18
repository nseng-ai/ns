import type { SlotFreeCleanupResult } from "../lifecycle/release-cleanup.ts";

export function cleanupErrorCount(cleanup: readonly SlotFreeCleanupResult[]): number {
	return cleanup.filter((result) => result.status === "error").length;
}

export function renderCleanupLines(cleanup: readonly SlotFreeCleanupResult[]): readonly string[] {
	return cleanup.map((result) => {
		const pr = result.pr_number === null ? "" : ` #${result.pr_number}`;
		const message = result.message === null ? "" : ` (${result.message})`;
		return `${result.slot_name} cleanup ${result.action}${pr}: ${result.status}${message}`;
	});
}

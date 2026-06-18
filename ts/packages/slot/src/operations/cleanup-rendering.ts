import type { SlotFreeCleanupResult } from "../lifecycle/release-cleanup.ts";

export function cleanupErrorCount(cleanup: readonly SlotFreeCleanupResult[]): number {
	return cleanup.filter((result) => result.status === "error").length;
}

export function renderCleanupLines(cleanup: readonly SlotFreeCleanupResult[], options: { isDryRun?: boolean | undefined } = {}): readonly string[] {
	return cleanup.map((result) => options.isDryRun === true ? cleanupPreviewLine(result) : cleanupResultLine(result));
}

export function cleanupPreviewLine(result: SlotFreeCleanupResult): string {
	if (result.status === "planned") {
		if (result.action === "pr") return `PR: close #${result.pr_number}`;
		return `local branch: force-delete ${result.branch_name}`;
	}
	if (result.status === "skipped") return `${cleanupSubject(result)}: skipped (${result.message ?? "already complete"})`;
	return `${cleanupSubject(result)}: error: ${result.message ?? "failed"}`;
}

export function cleanupResultLine(result: SlotFreeCleanupResult): string {
	if (result.status === "success") return `✓ ${cleanupSuccessText(result)}`;
	if (result.status === "skipped") return `- ${cleanupSkippedText(result)}`;
	if (result.status === "planned") return cleanupPreviewLine(result);
	return `✗ ${cleanupFailureText(result)}`;
}

function cleanupSubject(result: SlotFreeCleanupResult): string {
	if (result.action === "pr") return result.pr_number === null ? "PR" : `PR #${result.pr_number}`;
	return `local branch ${result.branch_name}`;
}

function cleanupSuccessText(result: SlotFreeCleanupResult): string {
	if (result.action === "pr") return `Closed PR #${result.pr_number}`;
	return `Force-deleted local branch ${result.branch_name}`;
}

function cleanupSkippedText(result: SlotFreeCleanupResult): string {
	return `Skipped ${cleanupSubject(result)}: ${result.message ?? "already complete"}`;
}

function cleanupFailureText(result: SlotFreeCleanupResult): string {
	const message = result.message ?? "failed";
	if (result.action === "pr") {
		if (result.pr_number !== null) return `Failed to close PR #${result.pr_number}: ${message}`;
		return `Failed to close PR: ${message}`;
	}
	return `Failed to force-delete local branch ${result.branch_name}: ${message}`;
}

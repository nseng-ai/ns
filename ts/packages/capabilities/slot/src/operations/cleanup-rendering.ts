import type { Caps } from "@sdl/clinkr";
import { glyph, paint } from "@sdl/cli-theme";

import type { SlotFreeCleanupResult } from "../lifecycle/release-cleanup.ts";

export function cleanupErrorCount(cleanup: readonly SlotFreeCleanupResult[]): number {
	return cleanup.filter((result) => result.status === "error").length;
}

export function renderCleanupLines(
	cleanup: readonly SlotFreeCleanupResult[],
	options: { isDryRun?: boolean | undefined; caps?: Caps | undefined } = {},
): readonly string[] {
	return cleanup.map((result) =>
		options.isDryRun === true
			? cleanupPreviewLine(result, options.caps)
			: cleanupResultLine(result, options.caps),
	);
}

export function cleanupPreviewLine(result: SlotFreeCleanupResult, caps?: Caps | undefined): string {
	if (result.status === "planned") return stylePlanned(caps, cleanupPlannedText(result));
	if (result.status === "skipped")
		return styleSkipped(
			caps,
			`${cleanupSubject(result)} skipped: ${result.message ?? "already complete"}`,
		);
	return styleFailure(caps, `${cleanupSubject(result)} error: ${result.message ?? "failed"}`);
}

export function cleanupResultLine(result: SlotFreeCleanupResult, caps?: Caps | undefined): string {
	if (result.status === "success") return styleSuccess(caps, cleanupSuccessText(result));
	if (result.status === "skipped") return styleSkipped(caps, cleanupSkippedText(result));
	if (result.status === "planned") return cleanupPreviewLine(result, caps);
	return styleFailure(caps, cleanupFailureText(result));
}

function cleanupSubject(result: SlotFreeCleanupResult): string {
	if (result.action === "pr") return result.pr_number === null ? "PR" : `PR #${result.pr_number}`;
	return `local branch ${result.branch_name}`;
}

function cleanupPlannedText(result: SlotFreeCleanupResult): string {
	if (result.action === "pr") return `would close PR #${result.pr_number}`;
	return `would force-delete local branch ${result.branch_name}`;
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

function stylePlanned(caps: Caps | undefined, text: string): string {
	return caps === undefined ? text : paint(caps, "warn", text);
}

function styleSuccess(caps: Caps | undefined, text: string): string {
	const mark = caps === undefined ? "✓" : paint(caps, "success", glyph(caps, "done"));
	return `${mark} ${caps === undefined ? text : paint(caps, "success", text)}`;
}

function styleSkipped(caps: Caps | undefined, text: string): string {
	const mark = caps === undefined ? "-" : paint(caps, "muted", glyph(caps, "skip"));
	return `${mark} ${caps === undefined ? text : paint(caps, "muted", text)}`;
}

function styleFailure(caps: Caps | undefined, text: string): string {
	const mark = caps === undefined ? "✗" : paint(caps, "error", glyph(caps, "fail"));
	return `${mark} ${caps === undefined ? text : paint(caps, "error", text)}`;
}

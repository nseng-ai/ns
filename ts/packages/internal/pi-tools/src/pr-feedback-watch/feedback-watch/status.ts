import { formatElapsedMs } from "@nseng-ai/foundation/time-format";

import {
	DEFAULT_INTERVAL_MS,
	PR_FEEDBACK_WATCH_COMMAND_NAME,
	REST_FAILURE_STATUS,
} from "./constants.ts";
import type { PrCheckSummary, WatchMode, WatchStatus } from "./model.ts";

export type WatchRestingState = Extract<WatchStatus["state"], "active" | "stopped">;

export function initialWatchStatus(): WatchStatus {
	return {
		isEnabled: false,
		state: "stopped",
		mode: "stopped",
		intervalMs: DEFAULT_INTERVAL_MS,
		seenCount: 0,
		attemptedCount: 0,
		queuedCount: 0,
		restFailures: 0,
	};
}

export function restingState(isEnabled: boolean): WatchRestingState {
	return isEnabled ? "active" : "stopped";
}

export function defaultStatusLine(status: WatchStatus): string | undefined {
	if (!status.isEnabled && status.state === "stopped") return undefined;
	if (status.state === "paused") return "PR watch: paused";
	if (status.state === "dispatching") return `PR watch: dispatching ${status.queuedCount} item(s)`;
	if (status.state === "error")
		return status.mode === "heavy_fallback" ? REST_FAILURE_STATUS : "PR watch: error";
	if (status.mode === "heavy_fallback" && status.prNumber !== undefined)
		return "PR watch: fallback polling 60s";
	if (status.prNumber !== undefined) {
		const intervalSeconds = Math.round(status.intervalMs / 1_000);
		const feedbackAge =
			status.lastRestPollAt === undefined
				? `feedback ${intervalSeconds}s`
				: `feedback ${formatElapsedSinceMs(status.lastRestPollAt)}/${intervalSeconds}s`;
		const checks =
			status.checkSummary === undefined ? "" : ` · ${formatCheckSummary(status.checkSummary)}`;
		return `PR #${status.prNumber} · ${feedbackAge}${checks} · /${PR_FEEDBACK_WATCH_COMMAND_NAME} stops`;
	}
	return "PR watch: active";
}

function formatCheckSummary(summary: PrCheckSummary): string {
	return `[ci](pending:${summary.pendingCount} ok:${summary.passCount} fail:${summary.failCount})`;
}

export function shouldRefreshStatusAge(status: WatchStatus): boolean {
	return (
		status.isEnabled &&
		status.state === "active" &&
		status.mode === "rest_fingerprint" &&
		status.prNumber !== undefined &&
		status.lastRestPollAt !== undefined
	);
}

function formatElapsedSinceMs(iso: string): string {
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return "recently";
	return formatElapsedMs(Date.now() - timestamp);
}

export function formatWatchStatus(status: WatchStatus): string {
	const lines = [
		`PR feedback watch: ${status.isEnabled ? status.state : "stopped"}`,
		`Interval: ${Math.round(status.intervalMs / 1_000)}s`,
		`Mode: ${formatWatchMode(status.mode)}`,
		`REST failures: ${status.restFailures}`,
		`Seen: ${status.seenCount}`,
		`Attempted: ${status.attemptedCount}`,
		`Queued: ${status.queuedCount}`,
	];
	if (status.prNumber !== undefined) lines.push(`PR: #${status.prNumber}`);
	if (status.branch !== undefined) lines.push(`Branch: ${status.branch}`);
	if (status.checkSummary !== undefined)
		lines.push(`CI: ${formatCheckSummary(status.checkSummary)}`);
	if (status.lastRestPollAt !== undefined) lines.push(`Last REST poll: ${status.lastRestPollAt}`);
	if (status.lastHeavyCheckAt !== undefined)
		lines.push(`Last heavy check: ${status.lastHeavyCheckAt}`);
	if (status.lastPollAt !== undefined) lines.push(`Last poll: ${status.lastPollAt}`);
	if (status.lastError !== undefined) lines.push(`Last error: ${status.lastError}`);
	return lines.join("\n");
}

function formatWatchMode(mode: WatchMode): string {
	if (mode === "rest_fingerprint") return "REST fingerprint";
	if (mode === "heavy_fallback") return "heavy fallback";
	return "stopped";
}

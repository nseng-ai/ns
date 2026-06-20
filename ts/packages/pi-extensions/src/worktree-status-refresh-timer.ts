import type { Clock } from "@asdl/core/clock";
import type { ScheduledTimer, TimerScheduler } from "@asdl/core/timers";

export const WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS = 10_000;

export interface WorktreeStatusRefreshTimer {
	resume(): void;
	pause(): void;
	reset(): void;
	nextTickAtMs(): number | undefined;
	close(): void;
}

export function createWorktreeStatusRefreshTimer(options: {
	timers: TimerScheduler;
	clock: Clock;
	isActive(): boolean;
	onTick(): Promise<void>;
	intervalMs: number;
}): WorktreeStatusRefreshTimer {
	let pending: ScheduledTimer | undefined;
	let pendingDueMs: number | undefined;
	let isResumed = false;
	let isClosed = false;
	let isRunning = false;

	function resume(): void {
		if (isClosed || isResumed) return;
		isResumed = true;
		scheduleNextTick();
	}

	function pause(): void {
		if (isClosed || !isResumed) return;
		isResumed = false;
		clearPending();
	}

	function reset(): void {
		if (isClosed || !isResumed || !options.isActive()) return;
		clearPending();
		scheduleNextTick();
	}

	function nextTickAtMs(): number | undefined {
		return pendingDueMs;
	}

	function close(): void {
		isClosed = true;
		isResumed = false;
		clearPending();
	}

	function scheduleNextTick(): void {
		if (pending !== undefined || isClosed || !isResumed || !options.isActive()) return;
		pendingDueMs = options.clock.nowMs() + options.intervalMs;
		pending = options.timers.setTimeout(() => {
			pending = undefined;
			pendingDueMs = undefined;
			void runTick();
		}, options.intervalMs);
	}

	function clearPending(): void {
		if (pending === undefined) return;
		pending.cancel();
		pending = undefined;
		pendingDueMs = undefined;
	}

	async function runTick(): Promise<void> {
		if (isRunning || isClosed || !isResumed || !options.isActive()) return;
		isRunning = true;
		try {
			await options.onTick();
		} catch {
			// Background status refresh must never crash Pi.
		} finally {
			isRunning = false;
			scheduleNextTick();
		}
	}

	return { resume, pause, reset, nextTickAtMs, close };
}

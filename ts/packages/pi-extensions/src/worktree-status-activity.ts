import type { Clock } from "@asdl/core/clock";
import type { ScheduledTimer, TimerScheduler } from "@asdl/core/timers";

export const WORKTREE_STATUS_DORMANT_AFTER_MS = 120_000;

export interface WorktreeStatusActivityController {
	recordActivity(options?: WorktreeStatusActivityOptions): void;
	isDormant(): boolean;
	close(): void;
}

export interface WorktreeStatusActivityOptions {
	readonly shouldRefreshOnWake?: boolean;
}

export function createWorktreeStatusActivityController(options: {
	timers: TimerScheduler;
	clock: Clock;
	isActive(): boolean;
	isBusy(): boolean;
	onDormantChange(isDormant: boolean): void;
	onWakeRefresh(): void;
}): WorktreeStatusActivityController {
	let lastActivityAtMs = options.clock.nowMs();
	let isDormant = false;
	let isClosed = false;
	let dormancyTimer: ScheduledTimer | undefined;

	function recordActivity(activityOptions: WorktreeStatusActivityOptions = {}): void {
		if (isClosed || !options.isActive()) return;
		lastActivityAtMs = options.clock.nowMs();
		if (isDormant) {
			isDormant = false;
			options.onDormantChange(false);
			if (activityOptions.shouldRefreshOnWake !== false) options.onWakeRefresh();
		}
		scheduleDormancyCheck();
	}

	function scheduleDormancyCheck(): void {
		clearDormancyTimer();
		if (isClosed || !options.isActive()) return;
		const delayMs = Math.max(
			0,
			lastActivityAtMs + WORKTREE_STATUS_DORMANT_AFTER_MS - options.clock.nowMs(),
		);
		dormancyTimer = options.timers.setTimeout(checkDormancy, delayMs);
	}

	function clearDormancyTimer(): void {
		if (dormancyTimer === undefined) return;
		dormancyTimer.cancel();
		dormancyTimer = undefined;
	}

	function checkDormancy(): void {
		dormancyTimer = undefined;
		if (isClosed || !options.isActive()) return;
		if (isBusySafely()) {
			lastActivityAtMs = options.clock.nowMs();
			scheduleDormancyCheck();
			return;
		}

		const idleMs = options.clock.nowMs() - lastActivityAtMs;
		if (idleMs < WORKTREE_STATUS_DORMANT_AFTER_MS) {
			scheduleDormancyCheck();
			return;
		}

		enterDormantMode();
	}

	function isBusySafely(): boolean {
		try {
			return options.isBusy();
		} catch {
			return false;
		}
	}

	function enterDormantMode(): void {
		if (isClosed || isDormant || !options.isActive()) return;
		isDormant = true;
		options.onDormantChange(true);
	}

	function close(): void {
		isClosed = true;
		clearDormancyTimer();
	}

	scheduleDormancyCheck();

	return {
		recordActivity,
		isDormant() {
			return isDormant;
		},
		close,
	};
}

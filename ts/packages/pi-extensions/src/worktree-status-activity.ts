import { unrefTimer } from "./timers.ts";

export const WORKTREE_STATUS_DORMANT_AFTER_MS = 120_000;

export interface WorktreeStatusActivityController {
	recordActivity(options?: WorktreeStatusActivityOptions): void;
	isDormant(): boolean;
	close(): void;
}

export interface WorktreeStatusActivityOptions {
	readonly shouldRefreshOnWake?: boolean;
}

export interface WorktreeStatusActivityDependencies {
	setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
	now(): number;
}

export function createWorktreeStatusActivityController(options: {
	dependencies: WorktreeStatusActivityDependencies;
	isActive(): boolean;
	isBusy(): boolean;
	onDormantChange(isDormant: boolean): void;
	onWakeRefresh(): void;
}): WorktreeStatusActivityController {
	let lastActivityAtMs = options.dependencies.now();
	let isDormant = false;
	let isClosed = false;
	let dormancyTimer: ReturnType<typeof setTimeout> | undefined;

	function recordActivity(activityOptions: WorktreeStatusActivityOptions = {}): void {
		if (isClosed || !options.isActive()) return;
		lastActivityAtMs = options.dependencies.now();
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
			lastActivityAtMs + WORKTREE_STATUS_DORMANT_AFTER_MS - options.dependencies.now(),
		);
		dormancyTimer = options.dependencies.setTimeout(checkDormancy, delayMs);
		unrefTimer(dormancyTimer);
	}

	function clearDormancyTimer(): void {
		if (dormancyTimer === undefined) return;
		options.dependencies.clearTimeout(dormancyTimer);
		dormancyTimer = undefined;
	}

	function checkDormancy(): void {
		dormancyTimer = undefined;
		if (isClosed || !options.isActive()) return;
		if (isBusySafely()) {
			lastActivityAtMs = options.dependencies.now();
			scheduleDormancyCheck();
			return;
		}

		const idleMs = options.dependencies.now() - lastActivityAtMs;
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

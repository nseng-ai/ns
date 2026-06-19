import { unrefTimer } from "./timers.ts";

export const WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS = 30_000;

export interface WorktreeStatusRefreshTimer {
	resume(): void;
	pause(): void;
	close(): void;
}

interface WorktreeStatusRefreshTimerDependencies {
	setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
}

export function createWorktreeStatusRefreshTimer(options: {
	dependencies: WorktreeStatusRefreshTimerDependencies;
	isActive(): boolean;
	onTick(): Promise<void>;
	intervalMs: number;
}): WorktreeStatusRefreshTimer {
	let pending: ReturnType<typeof setTimeout> | undefined;
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

	function close(): void {
		isClosed = true;
		isResumed = false;
		clearPending();
	}

	function scheduleNextTick(): void {
		if (pending !== undefined || isClosed || !isResumed || !options.isActive()) return;
		pending = options.dependencies.setTimeout(() => {
			pending = undefined;
			void runTick();
		}, options.intervalMs);
		unrefTimer(pending);
	}

	function clearPending(): void {
		if (pending === undefined) return;
		options.dependencies.clearTimeout(pending);
		pending = undefined;
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

	return { resume, pause, close };
}

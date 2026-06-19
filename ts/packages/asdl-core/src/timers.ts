export interface ScheduledTimer {
	cancel(): void;
}

export interface TimerScheduler {
	setTimeout(callback: () => void, delayMs: number): ScheduledTimer;
}

export const systemTimerScheduler: TimerScheduler = {
	setTimeout(callback, delayMs) {
		const timeout = setTimeout(callback, delayMs);
		return {
			cancel: () => clearTimeout(timeout),
		};
	},
};

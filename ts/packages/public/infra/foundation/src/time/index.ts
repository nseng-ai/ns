import type { Clock } from "./clock.ts";
import { TimerScheduler, type ScheduledTimer } from "./timers.ts";

export interface TimeServices {
	readonly clock?: Clock;
	readonly timers?: TimerScheduler;
}

export const systemClock: Clock = {
	nowMs: () => Date.now(),
};

class SystemTimerScheduler extends TimerScheduler {
	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		const timeout = setTimeout(callback, delayMs);
		return {
			cancel: () => clearTimeout(timeout),
		};
	}

	setInterval(callback: () => void, delayMs: number): ScheduledTimer {
		const interval = setInterval(callback, delayMs);
		return {
			cancel: () => clearInterval(interval),
		};
	}
}

export const systemTimerScheduler: TimerScheduler = new SystemTimerScheduler();

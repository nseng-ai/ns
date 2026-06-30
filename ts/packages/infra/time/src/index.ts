import type { Clock } from "@sdl/core/clock";
import { TimerScheduler, type ScheduledTimer } from "@sdl/core/timers";

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

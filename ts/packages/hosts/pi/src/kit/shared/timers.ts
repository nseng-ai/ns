import { TimerScheduler, type ScheduledTimer } from "@ns/core/timers";

export function unrefTimer(
	timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>,
): void {
	if (typeof timer !== "object" || timer === null || !("unref" in timer)) return;
	const unref = timer.unref;
	if (typeof unref === "function") unref.call(timer);
}

/**
 * A {@link TimerScheduler} whose timers are unref'd, so long-lived background
 * timers never keep the Pi host process alive at shutdown. This is the
 * difference from `@ns/core/time`'s `systemTimerScheduler`, whose consumers are
 * short-lived awaited timeouts that intentionally do not unref.
 */
class UnrefTimerScheduler extends TimerScheduler {
	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		const timeout = setTimeout(callback, delayMs);
		unrefTimer(timeout);
		return {
			cancel: () => clearTimeout(timeout),
		};
	}

	setInterval(callback: () => void, delayMs: number): ScheduledTimer {
		const interval = setInterval(callback, delayMs);
		unrefTimer(interval);
		return {
			cancel: () => clearInterval(interval),
		};
	}
}

export const unrefTimerScheduler: TimerScheduler = new UnrefTimerScheduler();

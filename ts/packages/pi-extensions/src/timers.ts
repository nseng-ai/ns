import type { ScheduledTimer, TimerScheduler } from "@asdl/core/timers";

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
 * difference from `@asdl/core`'s `systemTimerScheduler`, whose consumers are
 * short-lived awaited timeouts that intentionally do not unref.
 */
export const unrefTimerScheduler: TimerScheduler = {
	setTimeout(callback, delayMs): ScheduledTimer {
		const timeout = setTimeout(callback, delayMs);
		unrefTimer(timeout);
		return {
			cancel: () => clearTimeout(timeout),
		};
	},
};

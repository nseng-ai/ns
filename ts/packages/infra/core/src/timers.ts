export interface ScheduledTimer {
	cancel(): void;
}

export abstract class TimerScheduler {
	abstract setTimeout(callback: () => void, delayMs: number): ScheduledTimer;
	abstract setInterval(callback: () => void, delayMs: number): ScheduledTimer;

	async delay(delayMs: number): Promise<void> {
		await new Promise<void>((resolve) => {
			this.setTimeout(resolve, delayMs);
		});
	}
}

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

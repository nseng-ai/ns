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

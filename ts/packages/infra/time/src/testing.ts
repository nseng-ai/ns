import type { Clock } from "@sdl/core/clock";
import { TimerScheduler, type ScheduledTimer } from "@sdl/core/timers";

export interface ManualClock {
	readonly clock: Clock;
	setMs(nowMs: number): void;
	advanceMs(deltaMs: number): void;
}

export interface ManualTimerScheduler {
	readonly timers: TimerScheduler;
	advanceMs(deltaMs: number): void;
	runNextTimer(): boolean;
	pendingTimerCount(): number;
}

export interface ManualTimerHarness extends ManualTimerScheduler {
	readonly clock: Clock;
	nowMs(): number;
}

export function createManualClock(startMs: number): ManualClock {
	let currentMs = validateFiniteMs(startMs, "startMs");
	const clock: Clock = {
		nowMs: () => currentMs,
	};

	return {
		clock,
		setMs(nowMs) {
			currentMs = validateFiniteMs(nowMs, "nowMs");
		},
		advanceMs(deltaMs) {
			currentMs = validateFiniteMs(currentMs + validateDeltaMs(deltaMs), "nowMs");
		},
	};
}

// Narrow scheduler-only convenience; delegates to the harness so manual timer behavior has one implementation.
export function createManualTimerScheduler(): ManualTimerScheduler {
	return createManualTimerHarness();
}

export function createManualTimerHarness(startMs = 0): ManualTimerHarness {
	let currentMs = validateFiniteMs(startMs, "startMs");
	let nextId = 0;
	const scheduledTimers: ManualScheduledTimerState[] = [];

	function timerById(id: number): ManualScheduledTimerState | undefined {
		return scheduledTimers.find((timer) => timer.id === id);
	}

	function replaceTimer(timer: ManualScheduledTimerState): void {
		const index = scheduledTimers.findIndex((scheduledTimer) => scheduledTimer.id === timer.id);
		if (index === -1) return;
		scheduledTimers[index] = timer;
	}

	function cancelTimer(id: number): void {
		const timer = timerById(id);
		if (timer === undefined) return;
		replaceTimer({ ...timer, isCancelled: true });
	}

	function runTimer(timerId: number): void {
		const timer = timerById(timerId);
		if (timer === undefined || !isPendingTimer(timer)) return;

		const firedTimer = { ...timer, hasFired: true };
		replaceTimer(firedTimer);
		currentMs = firedTimer.dueMs;
		firedTimer.callback();

		const latestTimer = timerById(timerId);
		if (latestTimer?.kind === "interval" && !latestTimer.isCancelled) {
			replaceTimer({
				...latestTimer,
				dueMs: validateFiniteMs(currentMs + latestTimer.intervalMs, "dueMs"),
				hasFired: false,
			});
		}
	}

	function nextPendingTimer(): ManualScheduledTimerState | undefined {
		let earliest: ManualScheduledTimerState | undefined;
		for (const timer of scheduledTimers) {
			if (!isPendingTimer(timer)) continue;
			if (
				earliest === undefined ||
				timer.dueMs < earliest.dueMs ||
				(timer.dueMs === earliest.dueMs && timer.id < earliest.id)
			) {
				earliest = timer;
			}
		}
		return earliest;
	}

	const timers = new ManualTimerSchedulerImpl({
		nowMs: () => currentMs,
		allocateId: () => {
			const id = nextId;
			nextId += 1;
			return id;
		},
		pushTimer: (timer) => scheduledTimers.push(timer),
		cancelTimer,
	});

	return {
		clock: {
			nowMs: () => currentMs,
		},
		nowMs() {
			return currentMs;
		},
		timers,
		advanceMs(deltaMs) {
			const targetMs = validateFiniteMs(currentMs + validateDeltaMs(deltaMs), "targetMs");
			let nextTimer = nextPendingTimer();
			while (nextTimer !== undefined && nextTimer.dueMs <= targetMs) {
				runTimer(nextTimer.id);
				nextTimer = nextPendingTimer();
			}
			currentMs = targetMs;
		},
		runNextTimer() {
			const timer = nextPendingTimer();
			if (timer === undefined) return false;
			runTimer(timer.id);
			return true;
		},
		pendingTimerCount() {
			return scheduledTimers.filter(isPendingTimer).length;
		},
	};
}

class ManualTimerSchedulerImpl extends TimerScheduler {
	private readonly options: ManualTimerSchedulerImplOptions;

	constructor(options: ManualTimerSchedulerImplOptions) {
		super();
		this.options = options;
	}

	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		const normalizedDelayMs = Math.max(0, validateFiniteMs(delayMs, "delayMs"));
		const timer: ManualScheduledTimerState = {
			kind: "timeout",
			id: this.options.allocateId(),
			dueMs: validateFiniteMs(this.options.nowMs() + normalizedDelayMs, "dueMs"),
			callback,
			isCancelled: false,
			hasFired: false,
		};
		this.options.pushTimer(timer);
		return {
			cancel: () => this.options.cancelTimer(timer.id),
		};
	}

	setInterval(callback: () => void, delayMs: number): ScheduledTimer {
		const normalizedDelayMs = Math.max(1, validateFiniteMs(delayMs, "delayMs"));
		const timer: ManualScheduledTimerState = {
			kind: "interval",
			id: this.options.allocateId(),
			dueMs: validateFiniteMs(this.options.nowMs() + normalizedDelayMs, "dueMs"),
			intervalMs: normalizedDelayMs,
			callback,
			isCancelled: false,
			hasFired: false,
		};
		this.options.pushTimer(timer);
		return {
			cancel: () => this.options.cancelTimer(timer.id),
		};
	}
}

interface ManualTimerSchedulerImplOptions {
	nowMs(): number;
	allocateId(): number;
	pushTimer(timer: ManualScheduledTimerState): void;
	cancelTimer(id: number): void;
}

type ManualScheduledTimerState = ManualTimeoutState | ManualIntervalState;

interface ManualTimerStateBase {
	readonly id: number;
	readonly callback: () => void;
	readonly dueMs: number;
	readonly isCancelled: boolean;
	readonly hasFired: boolean;
}

interface ManualTimeoutState extends ManualTimerStateBase {
	readonly kind: "timeout";
}

interface ManualIntervalState extends ManualTimerStateBase {
	readonly kind: "interval";
	readonly intervalMs: number;
}

function isPendingTimer(timer: ManualScheduledTimerState): boolean {
	return !timer.isCancelled && !timer.hasFired;
}

function validateFiniteMs(value: number, name: string): number {
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be finite`);
	}
	return value;
}

function validateDeltaMs(deltaMs: number): number {
	validateFiniteMs(deltaMs, "deltaMs");
	if (deltaMs < 0) {
		throw new Error("deltaMs must be non-negative");
	}
	return deltaMs;
}

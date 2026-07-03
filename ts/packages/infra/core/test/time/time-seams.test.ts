import { describe, expect, test } from "vitest";

import {
	createManualClock,
	createManualTimerHarness,
	createManualTimerScheduler,
} from "@ns/core/time/testing";

describe("manual clock", () => {
	test("sets and advances wall-clock time deterministically", () => {
		const manual = createManualClock(10);

		expect(manual.clock.nowMs()).toBe(10);

		manual.setMs(25);
		expect(manual.clock.nowMs()).toBe(25);

		manual.advanceMs(5);
		expect(manual.clock.nowMs()).toBe(30);
	});

	test("rejects non-finite and negative clock updates", () => {
		const manual = createManualClock(0);

		expect(() => createManualClock(Number.NaN)).toThrow("startMs must be finite");
		expect(() => manual.setMs(Number.POSITIVE_INFINITY)).toThrow("nowMs must be finite");
		expect(() => manual.advanceMs(-1)).toThrow("deltaMs must be non-negative");
	});
});

describe("manual timer scheduler", () => {
	test("runs scheduled callbacks after deterministic advancement", () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];

		manual.timers.setTimeout(() => events.push("late"), 20);
		manual.timers.setTimeout(() => events.push("early"), 10);

		manual.advanceMs(9);
		expect(events).toEqual([]);
		expect(manual.pendingTimerCount()).toBe(2);

		manual.advanceMs(1);
		expect(events).toEqual(["early"]);
		expect(manual.pendingTimerCount()).toBe(1);

		manual.advanceMs(10);
		expect(events).toEqual(["early", "late"]);
		expect(manual.pendingTimerCount()).toBe(0);
	});

	test("cancels pending timers", () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];
		const timer = manual.timers.setTimeout(() => events.push("cancelled"), 10);

		timer.cancel();
		manual.advanceMs(10);

		expect(events).toEqual([]);
		expect(manual.pendingTimerCount()).toBe(0);
	});

	test("runs nested timers due within the same advance window", () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];

		manual.timers.setTimeout(() => {
			events.push("outer");
			manual.timers.setTimeout(() => events.push("nested"), 5);
		}, 10);
		manual.timers.setTimeout(() => events.push("same-time"), 15);

		manual.advanceMs(15);

		expect(events).toEqual(["outer", "same-time", "nested"]);
		expect(manual.pendingTimerCount()).toBe(0);
	});

	test("runNextTimer advances to and runs only the earliest pending timer", () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];

		expect(manual.runNextTimer()).toBe(false);

		manual.timers.setTimeout(() => events.push("second"), 20);
		manual.timers.setTimeout(() => events.push("first"), 10);

		expect(manual.runNextTimer()).toBe(true);
		expect(events).toEqual(["first"]);
		expect(manual.pendingTimerCount()).toBe(1);

		expect(manual.runNextTimer()).toBe(true);
		expect(events).toEqual(["first", "second"]);
		expect(manual.runNextTimer()).toBe(false);
	});

	test("runs intervals for every due occurrence during deterministic advancement", () => {
		const manual = createManualTimerHarness();
		const events: string[] = [];

		manual.timers.setInterval(() => events.push(`tick-${manual.nowMs()}`), 5);
		manual.advanceMs(16);

		expect(events).toEqual(["tick-5", "tick-10", "tick-15"]);
		expect(manual.pendingTimerCount()).toBe(1);
	});

	test("cancels intervals", () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];
		const timer = manual.timers.setInterval(() => events.push("tick"), 5);

		manual.advanceMs(5);
		timer.cancel();
		manual.advanceMs(20);

		expect(events).toEqual(["tick"]);
		expect(manual.pendingTimerCount()).toBe(0);
	});

	test("resolves delay using the manual setTimeout implementation", async () => {
		const manual = createManualTimerScheduler();
		const events: string[] = [];
		const delayed = manual.timers.delay(10).then(() => events.push("done"));

		manual.advanceMs(9);
		expect(events).toEqual([]);

		manual.advanceMs(1);
		await delayed;

		expect(events).toEqual(["done"]);
	});

	test("normalizes zero-delay intervals to avoid an infinite manual-time loop", () => {
		const manual = createManualTimerHarness();
		const events: number[] = [];

		manual.timers.setInterval(() => events.push(manual.nowMs()), 0);
		manual.advanceMs(3);

		expect(events).toEqual([1, 2, 3]);
	});

	test("rejects non-finite scheduler inputs", () => {
		const manual = createManualTimerHarness();

		expect(() => createManualTimerHarness(Number.NaN)).toThrow("startMs must be finite");
		expect(() => manual.advanceMs(Number.NaN)).toThrow("deltaMs must be finite");
		expect(() => manual.timers.setTimeout(() => {}, Number.POSITIVE_INFINITY)).toThrow(
			"delayMs must be finite",
		);
		expect(() => manual.timers.setInterval(() => {}, Number.NaN)).toThrow("delayMs must be finite");
	});
});

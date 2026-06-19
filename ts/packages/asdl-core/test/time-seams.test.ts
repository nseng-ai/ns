import { describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@asdl/core/testing";

describe("manual clock", () => {
	test("sets and advances wall-clock time deterministically", () => {
		const manual = createManualClock(10);

		expect(manual.clock.nowMs()).toBe(10);

		manual.setMs(25);
		expect(manual.clock.nowMs()).toBe(25);

		manual.advanceMs(5);
		expect(manual.clock.nowMs()).toBe(30);
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
});

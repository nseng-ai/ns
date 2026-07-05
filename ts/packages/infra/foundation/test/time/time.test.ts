import { expect, test } from "vitest";

import { systemClock, systemTimerScheduler } from "@nseng-ai/foundation/time";

test("system clock reads wall-clock milliseconds", () => {
	expect(typeof systemClock.nowMs()).toBe("number");
});

test("system timer scheduler returns cancellable timers", () => {
	const timeout = systemTimerScheduler.setTimeout(() => {}, 1_000);
	const interval = systemTimerScheduler.setInterval(() => {}, 1_000);

	timeout.cancel();
	interval.cancel();
});

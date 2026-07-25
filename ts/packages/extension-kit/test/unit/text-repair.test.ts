import { describe, expect, test } from "vitest";

import { createDeferred } from "@nseng-ai/foundation/test-kit";
import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import {
	prepareRepairedText,
	type TextGenerationResult,
} from "@nseng-ai/extension-kit/text-repair";

describe("prepareRepairedText", () => {
	test("heartbeat progress reports elapsed time from the injected clock", async () => {
		const deferred = createDeferred<TextGenerationResult>();
		const clock = createManualClock(100);
		const timers = createManualTimerScheduler();
		const progress: Array<{ type: string; elapsedMs?: number }> = [];

		const resultPromise = prepareRepairedText({
			noun: "test text",
			initialPrompt: "draft",
			generate: async () => await deferred.promise,
			validate: (text) => ({ ok: true, value: text }),
			buildRepairPrompt: () => "repair",
			onProgress: (event) => progress.push(event),
			progressHeartbeatMs: 5_000,
			timers: timers.timers,
			clock: clock.clock,
		});

		await Promise.resolve();
		clock.advanceMs(7_400);
		timers.advanceMs(5_000);
		deferred.resolve({ ok: true, text: "valid" });

		await expect(resultPromise).resolves.toEqual({ ok: true, value: "valid", source: "model" });
		expect(progress).toContainEqual({
			type: "attempt_waiting",
			attempt: 1,
			maxAttempts: 2,
			elapsedMs: 7_400,
		});
		expect(timers.pendingTimerCount()).toBe(0);
	});
});

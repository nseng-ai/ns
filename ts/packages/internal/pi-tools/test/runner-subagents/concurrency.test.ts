import { describe, expect, test } from "vitest";

import { mapWithConcurrency } from "../../src/runner-subagents/concurrency.ts";

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	if (resolve === undefined) throw new Error("Deferred not initialized.");
	return { promise, resolve };
}

async function settleMicrotasks(count = 5): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

describe("mapWithConcurrency", () => {
	test("preserves order while limiting concurrent work", async () => {
		const deferreds = Array.from({ length: 4 }, () => createDeferred<string>());
		const started: number[] = [];
		let inFlight = 0;
		let maxInFlight = 0;
		const running = mapWithConcurrency({
			items: ["a", "b", "c", "d"],
			maxConcurrency: 2,
			run: async (_item, index) => {
				started.push(index);
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				try {
					return await deferreds[index]!.promise;
				} finally {
					inFlight -= 1;
				}
			},
		});
		await settleMicrotasks();

		expect(started).toEqual([0, 1]);
		expect(maxInFlight).toBe(2);
		deferreds[1]!.resolve("second");
		await settleMicrotasks();
		expect(started).toEqual([0, 1, 2]);
		deferreds[2]!.resolve("third");
		await settleMicrotasks();
		expect(started).toEqual([0, 1, 2, 3]);
		deferreds[3]!.resolve("fourth");
		deferreds[0]!.resolve("first");

		expect(await running).toEqual(["first", "second", "third", "fourth"]);
		expect(maxInFlight).toBe(2);
	});

	test("stops claiming new work after abort and leaves unclaimed slots undefined", async () => {
		const controller = new AbortController();
		const first = createDeferred<string>();
		const started: number[] = [];
		const running = mapWithConcurrency({
			items: ["a", "b", "c"],
			maxConcurrency: 1,
			signal: controller.signal,
			run: async (_item, index) => {
				started.push(index);
				return await first.promise;
			},
		});
		await settleMicrotasks();

		expect(started).toEqual([0]);
		controller.abort("stop");
		first.resolve("first");

		expect(await running).toEqual(["first", undefined, undefined]);
	});
});

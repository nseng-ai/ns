import { describe, expect, test } from "vitest";

import { createEventChannel } from "../../../src/runner/event-channel.ts";

describe("runner event channel", () => {
	test("delivers values pushed before consumption in order", async () => {
		const channel = createEventChannel<string>();
		channel.push("first");
		channel.push("second");
		channel.close();

		expect(await collect(channel.iterable)).toEqual(["first", "second"]);
	});

	test("resolves a pending pull when a value is pushed later", async () => {
		const channel = createEventChannel<string>();
		const iterator = channel.iterable[Symbol.asyncIterator]();
		const pendingPull = iterator.next();

		channel.push("late");

		expect(await pendingPull).toEqual({ done: false, value: "late" });
	});

	test("close resolves a pending pull as done", async () => {
		const channel = createEventChannel<string>();
		const iterator = channel.iterable[Symbol.asyncIterator]();
		const pendingPull = iterator.next();

		channel.close();

		expect(await pendingPull).toEqual({ done: true, value: undefined });
		expect(await iterator.next()).toEqual({ done: true, value: undefined });
	});

	test("delivers all values pushed before close, then ends iteration", async () => {
		const channel = createEventChannel<number>();
		channel.push(1);
		channel.push(2);
		channel.push(3);
		channel.close();

		expect(await collect(channel.iterable)).toEqual([1, 2, 3]);
	});

	test("interleaves pushes with consumption", async () => {
		const channel = createEventChannel<string>();
		const iterator = channel.iterable[Symbol.asyncIterator]();

		channel.push("a");
		expect(await iterator.next()).toEqual({ done: false, value: "a" });

		const pendingPull = iterator.next();
		channel.push("b");
		expect(await pendingPull).toEqual({ done: false, value: "b" });

		channel.close();
		expect(await iterator.next()).toEqual({ done: true, value: undefined });
	});

	test("close is idempotent", async () => {
		const channel = createEventChannel<string>();
		channel.close();
		channel.close();

		expect(await collect(channel.iterable)).toEqual([]);
	});

	test("push after close throws", () => {
		const channel = createEventChannel<string>();
		channel.close();

		expect(() => channel.push("too late")).toThrowError(/closed event channel/);
	});

	test("a second consumer throws", () => {
		const channel = createEventChannel<string>();
		channel.iterable[Symbol.asyncIterator]();

		expect(() => channel.iterable[Symbol.asyncIterator]()).toThrowError(/single consumer/);
	});
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = [];
	for await (const value of iterable) {
		values.push(value);
	}
	return values;
}

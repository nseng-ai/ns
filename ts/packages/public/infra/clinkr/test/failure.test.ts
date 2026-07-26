import { z } from "zod";
import { describe, expect, test } from "vitest";

import { LegacyClinkrGroup } from "../src/index.ts";
import { createCaptureIo, runForTest } from "../src/testing/index.ts";

function buildGroup(error: Error): LegacyClinkrGroup<null> {
	const group = new LegacyClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "explode",
		schema: z.object({}),
		handler: async () => {
			throw error;
		},
	});
	return group;
}

describe("unexpected throws", () => {
	test("propagates the original exception unchanged", async () => {
		const error = new Error("kaboom");
		await expect(runForTest(buildGroup(error), ["explode"], { context: null })).rejects.toBe(error);
	});

	test("writes nothing through the envelope channel", async () => {
		const capture = createCaptureIo();
		await expect(
			buildGroup(new Error("kaboom")).run(["explode", "--format", "json"], {
				context: null,
				io: capture.io,
			}),
		).rejects.toThrow("kaboom");
		expect(capture.stdout()).toBe("");
		expect(capture.stderr()).toBe("");
	});
});

import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { runForTest } from "../src/testing/index.ts";

function buildGroup(): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "echo",
		schema: z.object({ count: z.int() }),
		handler: async (_ctx, request) => ok(request),
	});
	group.command({
		name: "show",
		schema: z.object({ pr_number: z.int() }),
		positionals: { pr_number: { position: 0 } },
		handler: async (_ctx, request) => ok(request),
	});
	return group;
}

describe("strict integer options", () => {
	test("accepts decimal integers, including negatives", async () => {
		const run = await runForTest(buildGroup(), ["echo", "--count", "-12"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ count: -12 });
	});

	test.each(["12.5", "1e2", "0x10", "", "abc"])(
		"rejects %j with a usage error",
		async (value) => {
			const run = await runForTest(buildGroup(), ["echo", "--count", value], { context: null });
			expect(run.exitCode).toBe(2);
			expect(run.stdout).toBe("");
			expect(run.stderr).toContain("expected an integer");
		},
	);
});

describe("strict integer positionals", () => {
	test("accepts decimal integers", async () => {
		const run = await runForTest(buildGroup(), ["show", "41"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ pr_number: 41 });
	});

	test.each(["12.5", "1e2", "0x10"])("rejects %j with a usage error", async (value) => {
		const run = await runForTest(buildGroup(), ["show", value], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("expected an integer");
	});
});

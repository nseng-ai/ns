import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrFailure, ClinkrGroup, negative, ok, type ClinkrExit } from "../src/index.ts";
import { runForTest } from "../src/testing/index.ts";

type Outcome = "ok" | "negative" | "failure";

function buildGroup(outcome: Outcome): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "act",
		schema: z.object({}),
		handler: async (): Promise<ClinkrExit<{ value: number }>> => {
			if (outcome === "ok") return ok({ value: 7 });
			if (outcome === "negative") return negative("no work");
			throw new ClinkrFailure({ errorType: "boom", message: "it broke" });
		},
		legacyMachine: (exit) => {
			if (exit.type === "ok") {
				return { body: { success: true, value: exit.data.value }, exitCode: 0 };
			}
			return { body: { success: false, error: exit.message }, exitCode: 1 };
		},
	});
	return group;
}

describe("legacyMachine under --format json", () => {
	test("ok routes through the legacy body and exit code", async () => {
		const run = await runForTest(buildGroup("ok"), ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ success: true, value: 7 });
		expect(run.stdout).toBe('{\n  "success": true,\n  "value": 7\n}\n');
	});

	test("compact serialization writes JSON.stringify bytes", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ value: "☃" }),
			legacyMachine: (exit) => ({
				body: { success: true, data: exit },
				exitCode: 0,
				serialization: "compact",
			}),
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe(
			`${JSON.stringify({ success: true, data: { type: "ok", data: { value: "☃" } } })}\n`,
		);
	});

	test("negative keeps the legacy shape and legacy exit code", async () => {
		const run = await runForTest(buildGroup("negative"), ["act", "--format", "json"], {
			context: null,
		});
		expect(run.exitCode).toBe(1);
		expect(JSON.parse(run.stdout)).toEqual({ success: false, error: "no work" });
	});

	test("failure routes the converted failure variant through the hook", async () => {
		const run = await runForTest(buildGroup("failure"), ["act", "--format", "json"], {
			context: null,
		});
		expect(run.exitCode).toBe(1);
		expect(JSON.parse(run.stdout)).toEqual({ success: false, error: "it broke" });
	});
});

describe("legacyMachine boundaries", () => {
	test("human mode ignores legacyMachine", async () => {
		const run = await runForTest(buildGroup("ok"), ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "value": 7\n}\n');
	});

	test("markdown mode ignores legacyMachine", async () => {
		const run = await runForTest(buildGroup("ok"), ["act", "--format", "markdown"], {
			context: null,
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "value": 7\n}\n');
	});

	test("usage errors keep clinkr semantics, not the legacy shape", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({ name: z.string() }),
			handler: async (_ctx, request) => ok(request),
			legacyMachine: () => ({ body: { success: false }, exitCode: 9 }),
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--name");
	});
});

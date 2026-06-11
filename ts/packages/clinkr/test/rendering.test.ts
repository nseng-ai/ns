import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, negative, ok, type ClinkrExit } from "../src/index.ts";
import { runForTest } from "../src/testing/index.ts";

interface Payload {
	count: number;
}

function buildGroup(outcome: "ok" | "negative"): {
	group: ClinkrGroup<null>;
	renderCalls: () => number;
} {
	let renderCalls = 0;
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "act",
		schema: z.object({}),
		handler: async (): Promise<ClinkrExit<Payload>> =>
			outcome === "ok" ? ok({ count: 2 }) : negative("none"),
		renderHuman: (data) => {
			renderCalls += 1;
			return `plans: ${data.count}`;
		},
	});
	return { group, renderCalls: () => renderCalls };
}

describe("renderHuman", () => {
	test("renders the ok data as a string the dispatcher writes", async () => {
		const { group } = buildGroup("ok");
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("plans: 2\n");
	});

	test("is not called for the negative channel", async () => {
		const { group, renderCalls } = buildGroup("negative");
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toBe("none\n");
		expect(renderCalls()).toBe(0);
	});

	test("is not called in json mode", async () => {
		const { group, renderCalls } = buildGroup("ok");
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ exit_code: 0, data: { count: 2 } });
		expect(renderCalls()).toBe(0);
	});

	test("default human rendering is indented JSON when absent", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }),
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.stdout).toBe('{\n  "count": 2\n}\n');
	});
});

describe("summary field", () => {
	test("summary is used by commander for parent help lists", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			description: "Detailed description for the command",
			summary: "Quick summary",
			schema: z.object({}),
			handler: async () => ok({ result: 1 }),
		});
		const parentRun = await runForTest(group, [], { context: null });
		expect(parentRun.exitCode).toBe(0);
		expect(parentRun.stdout).toContain("Quick summary");
		expect(parentRun.stdout).not.toContain("Detailed description for the command");

		const leafRun = await runForTest(group, ["act", "--help"], { context: null });
		expect(leafRun.exitCode).toBe(0);
		expect(leafRun.stdout).toContain("Detailed description for the command");
	});

	test("summary is optional; commands work without it", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			description: "No summary",
			schema: z.object({}),
			handler: async () => ok({ value: 1 }),
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
	});
});

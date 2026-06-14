import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrFailure, ClinkrGroup, negative, ok, type ClinkrExit } from "../src/index.ts";
import { runForTest } from "../src/testing/index.ts";

interface Payload {
	count: number;
}

type Outcome = "ok" | "negative" | "failure";

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

function buildMarkdownGroup(
	outcome: Outcome,
	options: { shouldIncludeHuman: boolean; shouldIncludeMarkdown: boolean },
): {
	group: ClinkrGroup<null>;
	humanCalls: () => number;
	markdownCalls: () => number;
} {
	let humanCalls = 0;
	let markdownCalls = 0;
	const renderHuman = (data: Payload): string => {
		humanCalls += 1;
		return `plans: ${data.count}`;
	};
	const renderMarkdown = (data: Payload): string => {
		markdownCalls += 1;
		return `- plans: ${data.count}`;
	};
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "act",
		schema: z.object({}),
		handler: async (): Promise<ClinkrExit<Payload>> => {
			if (outcome === "ok") return ok({ count: 2 });
			if (outcome === "negative") return negative("none");
			throw new ClinkrFailure({ errorType: "boom", message: "broke" });
		},
		...(options.shouldIncludeHuman ? { renderHuman } : {}),
		...(options.shouldIncludeMarkdown ? { renderMarkdown } : {}),
	});
	return { group, humanCalls: () => humanCalls, markdownCalls: () => markdownCalls };
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

describe("renderMarkdown", () => {
	test("renders ok data in markdown mode", async () => {
		const { group } = buildMarkdownGroup("ok", { shouldIncludeHuman: true, shouldIncludeMarkdown: true });
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("- plans: 2\n");
	});

	test("is not called in human mode", async () => {
		const { group, markdownCalls } = buildMarkdownGroup("ok", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("plans: 2\n");
		expect(markdownCalls()).toBe(0);
	});

	test("is not called in json mode", async () => {
		const { group, markdownCalls } = buildMarkdownGroup("ok", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ exit_code: 0, data: { count: 2 } });
		expect(markdownCalls()).toBe(0);
	});

	test("is not called for negative exits", async () => {
		const { group, markdownCalls } = buildMarkdownGroup("negative", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toBe("none\n");
		expect(markdownCalls()).toBe(0);
	});

	test("is not called for failure exits", async () => {
		const { group, markdownCalls } = buildMarkdownGroup("failure", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stderr).toBe("error: broke\n");
		expect(markdownCalls()).toBe(0);
	});

	test("falls back to renderHuman when renderMarkdown is absent", async () => {
		const { group } = buildMarkdownGroup("ok", { shouldIncludeHuman: true, shouldIncludeMarkdown: false });
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("plans: 2\n");
	});

	test("falls back to indented JSON when renderMarkdown and renderHuman are absent", async () => {
		const { group } = buildMarkdownGroup("ok", { shouldIncludeHuman: false, shouldIncludeMarkdown: false });
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
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

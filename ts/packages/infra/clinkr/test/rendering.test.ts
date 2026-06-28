import { z } from "zod";
import { describe, expect, test } from "vitest";

import {
	ClinkrFailure,
	ClinkrGroup,
	negative,
	ok,
	resolveRenderCapabilities,
	type ClinkrExit,
} from "../src/index.ts";
import type { Caps } from "../src/caps.ts";
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

describe("resolveRenderCapabilities", () => {
	test("uses sink caps when present", () => {
		const caps: Caps = {
			isTty: false,
			colorDepth: "none",
			columns: 72,
			canRenderUnicode: false,
		};
		expect(resolveRenderCapabilities({ canEmitAnsi: false, caps })).toBe(caps);
	});

	test("falls back to settled non-interactive caps", () => {
		expect(resolveRenderCapabilities({ canEmitAnsi: false })).toMatchObject({
			isTty: false,
			colorDepth: "none",
		});
	});
});

describe("renderHuman", () => {
	test("renders the ok data as a string the dispatcher writes", async () => {
		const { group } = buildGroup("ok");
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("plans: 2\n");
	});

	test("is not called for the negative channel when no data is attached", async () => {
		const { group, renderCalls } = buildGroup("negative");
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("none\n");
		expect(renderCalls()).toBe(0);
	});

	test("negative human override renders to stderr", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => negative("none", { count: 2 }, { human: "rendered negative" }),
			renderHuman: (data) => `plans: ${data.count}`,
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("rendered negative\n");
	});

	test("is not called in json mode", async () => {
		const { group, renderCalls } = buildGroup("ok");
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ status: "ok", exitCode: 0, data: { count: 2 } });
		expect(renderCalls()).toBe(0);
	});

	test("receives the resolved sink caps", async () => {
		const sinkCaps: Caps = {
			isTty: false,
			colorDepth: "none",
			columns: 72,
			canRenderUnicode: false,
		};
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }),
			renderHuman: (_data, caps) => `${caps.caps?.columns}:${caps.caps?.canRenderUnicode}`,
		});
		const stdout: string[] = [];
		const stderr: string[] = [];
		const exitCode = await group.run(["act"], {
			context: null,
			io: {
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				canEmitAnsi: false,
				caps: sinkCaps,
			},
		});
		expect(exitCode).toBe(0);
		expect(stdout.join("")).toBe("72:false\n");
		expect(stderr).toEqual([]);
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

	test("ok-exit human override takes precedence over command renderer", async () => {
		let renderCalls = 0;
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }, { human: "override" }),
			renderHuman: (data) => {
				renderCalls += 1;
				return `plans: ${data.count}`;
			},
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("override\n");
		expect(renderCalls).toBe(0);
	});

	test("json mode ignores ok-exit render overrides", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }, { human: "human", markdown: "markdown" }),
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({ status: "ok", exitCode: 0, data: { count: 2 } });
		expect(run.stdout).not.toContain("human");
		expect(run.stdout).not.toContain("markdown");
	});
});

describe("renderMarkdown", () => {
	test("renders ok data in markdown mode", async () => {
		const { group } = buildMarkdownGroup("ok", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
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
		expect(JSON.parse(run.stdout)).toEqual({ status: "ok", exitCode: 0, data: { count: 2 } });
		expect(markdownCalls()).toBe(0);
	});

	test("is not called for negative exits", async () => {
		const { group, markdownCalls } = buildMarkdownGroup("negative", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: true,
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stdout).toBe("");
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
		const { group } = buildMarkdownGroup("ok", {
			shouldIncludeHuman: true,
			shouldIncludeMarkdown: false,
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("plans: 2\n");
	});

	test("uses ok-exit markdown override before command markdown renderer", async () => {
		let markdownCalls = 0;
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }, { human: "human override", markdown: "md override" }),
			renderMarkdown: (data) => {
				markdownCalls += 1;
				return `- plans: ${data.count}`;
			},
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("md override\n");
		expect(markdownCalls).toBe(0);
	});

	test("markdown falls back to ok-exit human override", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "act",
			schema: z.object({}),
			handler: async () => ok({ count: 2 }, { human: "human override" }),
		});
		const run = await runForTest(group, ["act", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("human override\n");
	});

	test("falls back to indented JSON when renderMarkdown and renderHuman are absent", async () => {
		const { group } = buildMarkdownGroup("ok", {
			shouldIncludeHuman: false,
			shouldIncludeMarkdown: false,
		});
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

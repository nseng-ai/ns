import { z } from "zod";
import { describe, expect, test } from "vitest";

import {
	ClinkrGroup,
	clinkrFormatFromArgs,
	isClinkrHumanOutputInvocation,
	ok,
} from "../src/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

function buildGroup(): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "win",
		schema: z.object({}),
		handler: async () => ok({ answer: 42 }),
	});
	return group;
}

function buildMarkdownGroup(): {
	group: ClinkrGroup<null>;
	markdownCalls: () => number;
} {
	let markdownCalls = 0;
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "win",
		schema: z.object({}),
		handler: async () => ok({ answer: 42 }),
		renderHuman: (data) => `human answer: ${data.answer}`,
		renderMarkdown: (data) => {
			markdownCalls += 1;
			return `# Answer\n\n${data.answer}`;
		},
	});
	return { group, markdownCalls: () => markdownCalls };
}

describe("raw argv format detection", () => {
	test("detects the rendered format from raw command args", () => {
		expect(clinkrFormatFromArgs(["win"])).toBe("human");
		expect(clinkrFormatFromArgs(["win", "--format", "json"])).toBe("json");
		expect(clinkrFormatFromArgs(["win", "--format=json"])).toBe("json");
		expect(clinkrFormatFromArgs(["win", "--format", "markdown"])).toBe("markdown");
		expect(clinkrFormatFromArgs(["win", "--format=md"])).toBe("markdown");
	});

	test("repeated raw format args follow commander last-wins behavior", () => {
		expect(clinkrFormatFromArgs(["win", "--format", "human", "--format", "json"])).toBe("json");
		expect(clinkrFormatFromArgs(["win", "--format=json", "--format", "human"])).toBe("human");
	});

	test("human-output detection treats schema printing as non-human side-effect context", () => {
		expect(isClinkrHumanOutputInvocation(["win"])).toBe(true);
		expect(isClinkrHumanOutputInvocation(["win", "--format", "human"])).toBe(true);
		expect(isClinkrHumanOutputInvocation(["win", "--format", "json"])).toBe(false);
		expect(isClinkrHumanOutputInvocation(["win", "--format", "markdown"])).toBe(false);
		expect(isClinkrHumanOutputInvocation(["win", "--json-schema"])).toBe(false);
	});
});

describe("--format dispatch", () => {
	test("default format is human", async () => {
		const run = await runForTest(buildGroup(), ["win"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("--format json emits the machine envelope", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "json"], { context: null });
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
	});

	test("--format=json equals-syntax works", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format=json"], { context: null });
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
	});

	test("--format human is explicit and valid", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "human"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("--format markdown falls back to human rendering when no markdown renderer exists", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("--format md falls back to human rendering when no markdown renderer exists", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "md"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("--format markdown uses renderMarkdown when present", async () => {
		const { group } = buildMarkdownGroup();
		const run = await runForTest(group, ["win", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("# Answer\n\n42\n");
	});

	test("--format md is an alias for markdown rendering", async () => {
		const { group } = buildMarkdownGroup();
		const run = await runForTest(group, ["win", "--format", "md"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("# Answer\n\n42\n");
	});

	test("--format human still uses renderHuman when renderMarkdown exists", async () => {
		const { group } = buildMarkdownGroup();
		const run = await runForTest(group, ["win", "--format", "human"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("human answer: 42\n");
	});

	test("--format json emits the machine envelope without calling renderMarkdown", async () => {
		const { group, markdownCalls } = buildMarkdownGroup();
		const run = await runForTest(group, ["win", "--format", "json"], { context: null });
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
		expect(markdownCalls()).toBe(0);
	});

	test("an invalid format exits 2 with a raw usage error listing all four choices", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "bogus"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--format");
		expect(run.stderr).toContain("human, json, markdown, md");
	});

	test("a repeated --format is last-wins", async () => {
		const { group } = buildMarkdownGroup();
		const markdownRun = await runForTest(group, ["win", "--format", "human", "--format", "md"], {
			context: null,
		});
		expect(markdownRun.stdout).toBe("# Answer\n\n42\n");

		const jsonRun = await runForTest(group, ["win", "--format", "md", "--format", "json"], {
			context: null,
		});
		expect(parseEnvelope(jsonRun.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
	});
});

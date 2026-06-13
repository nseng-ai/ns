import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
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

	test("--format markdown renders through the human channel", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "markdown"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("--format md renders through the human channel", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "md"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
	});

	test("an invalid format exits 2 with a raw usage error listing all four choices", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "bogus"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--format");
		expect(run.stderr).toContain("human, json, markdown, md");
	});

	test("a repeated --format is last-wins", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "human", "--format", "json"], {
			context: null,
		});
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
	});
});

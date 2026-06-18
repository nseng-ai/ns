import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrFailure, ClinkrGroup, negative, ok, type ClinkrExit } from "../src/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

function buildGroup(): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "win",
		schema: z.object({}),
		handler: async () => ok({ answer: 42 }),
	});
	group.command({
		name: "no",
		schema: z.object({}),
		handler: async () => negative("nothing to do"),
	});
	group.command({
		name: "no-data",
		schema: z.object({}),
		handler: async (): Promise<ClinkrExit<{ count: number }>> => negative("empty", { count: 0 }),
	});
	group.command({
		name: "fail",
		schema: z.object({}),
		handler: async () => {
			throw new ClinkrFailure({ errorType: "boom", message: "it broke" });
		},
	});
	return group;
}

describe("human mode", () => {
	test("ok renders data as indented JSON to stdout and exits 0", async () => {
		const run = await runForTest(buildGroup(), ["win"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{\n  "answer": 42\n}\n');
		expect(run.stderr).toBe("");
	});

	test("negative writes the message to stdout and exits 0 by default", async () => {
		const run = await runForTest(buildGroup(), ["no"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("nothing to do\n");
		expect(run.stderr).toBe("");
	});

	test("negative writes the message to stderr and exits 1 with --shell-exit-code", async () => {
		const run = await runForTest(buildGroup(), ["no", "--shell-exit-code"], { context: null });
		expect(run.exitCode).toBe(1);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("nothing to do\n");
	});

	test("failure writes an error-prefixed message to stderr and exits 2", async () => {
		const run = await runForTest(buildGroup(), ["fail"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("error: it broke\n");
	});
});

describe("json mode", () => {
	test("ok emits the envelope with data and exits 0", async () => {
		const run = await runForTest(buildGroup(), ["win", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 0, data: { answer: 42 } });
		expect(run.stderr).toBe("");
	});

	test("negative emits semantic envelope exit_code 1 and exits 0 by default", async () => {
		const run = await runForTest(buildGroup(), ["no", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 1, message: "nothing to do" });
	});

	test("negative keeps semantic envelope exit_code 1 under --shell-exit-code", async () => {
		const run = await runForTest(buildGroup(), ["no", "--format", "json", "--shell-exit-code"], {
			context: null,
		});
		expect(run.exitCode).toBe(1);
		expect(parseEnvelope(run.stdout)).toEqual({ exit_code: 1, message: "nothing to do" });
	});

	test("negative with data includes the data key", async () => {
		const run = await runForTest(buildGroup(), ["no-data", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout)).toEqual({
			exit_code: 1,
			message: "empty",
			data: { count: 0 },
		});
	});

	test("failure emits error_type and message and exits 2", async () => {
		const run = await runForTest(buildGroup(), ["fail", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(parseEnvelope(run.stdout)).toEqual({
			exit_code: 2,
			error_type: "boom",
			message: "it broke",
		});
		expect(run.stderr).toBe("");
	});

	test("json envelope serializes with Python key order on the wire", async () => {
		const run = await runForTest(buildGroup(), ["fail", "--format", "json"], { context: null });
		expect(run.stdout).toBe(
			'{\n  "exit_code": 2,\n  "error_type": "boom",\n  "message": "it broke"\n}\n',
		);
	});
});

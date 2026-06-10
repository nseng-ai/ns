import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrFailure, ClinkrGroup, ok } from "../src/index.ts";
import { createCaptureIo, runForTest } from "../src/testing/index.ts";

function buildGroup(error: () => Error): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "explode",
		schema: z.object({}),
		handler: async () => {
			throw error();
		},
	});
	group.command({
		name: "fine",
		schema: z.object({}),
		handler: async () => ok({}),
	});
	return group;
}

describe("ClinkrFailure conversion", () => {
	test("a thrown ClinkrFailure becomes the failure channel in human mode", async () => {
		const group = buildGroup(
			() => new ClinkrFailure({ errorType: "missing_branch", message: "no such branch" }),
		);
		const run = await runForTest(group, ["explode"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stderr).toBe("error: no such branch\n");
	});

	test("a thrown ClinkrFailure becomes the failure envelope in json mode", async () => {
		const group = buildGroup(
			() => new ClinkrFailure({ errorType: "missing_branch", message: "no such branch" }),
		);
		const run = await runForTest(group, ["explode", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toEqual({
			exit_code: 2,
			error_type: "missing_branch",
			message: "no such branch",
		});
	});
});

describe("unexpected throws", () => {
	test("a non-ClinkrFailure throw propagates raw out of run()", async () => {
		const group = buildGroup(() => new Error("kaboom"));
		await expect(runForTest(group, ["explode"], { context: null })).rejects.toThrow("kaboom");
	});

	test("a crash writes nothing through the envelope channel", async () => {
		const group = buildGroup(() => new Error("kaboom"));
		const capture = createCaptureIo();
		await expect(
			group.run(["explode", "--format", "json"], { context: null, io: capture.io }),
		).rejects.toThrow("kaboom");
		expect(capture.stdout()).toBe("");
		expect(capture.stderr()).toBe("");
	});
});

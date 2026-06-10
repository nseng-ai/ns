import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { runForTest } from "../src/testing/index.ts";

function buildGroup(): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "echo",
		schema: z.object({
			name: z.string(),
			count: z.number().default(1),
			mode: z.enum(["fast", "slow"]).default("fast"),
		}),
		handler: async (_ctx, request) => ok(request),
	});
	group.command({
		name: "move",
		schema: z.object({ source: z.string() }),
		positionals: { source: { position: 0 } },
		handler: async (_ctx, request) => ok(request),
	});
	return group;
}

describe("usage errors", () => {
	test("unknown option exits 2 with a raw commander message", async () => {
		const run = await runForTest(buildGroup(), ["echo", "--name", "x", "--bogus"], {
			context: null,
		});
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("unknown option '--bogus'");
	});

	test("missing required option exits 2 with the flag named", async () => {
		const run = await runForTest(buildGroup(), ["echo"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--name");
	});

	test("missing required option is never enveloped, even in json mode", async () => {
		const run = await runForTest(buildGroup(), ["echo", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--name");
		expect(run.stderr).not.toContain("exit_code");
	});

	test("missing required positional exits 2 with the positional named", async () => {
		const run = await runForTest(buildGroup(), ["move"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("source");
	});

	test("malformed number exits 2 via the commander channel", async () => {
		const run = await runForTest(buildGroup(), ["echo", "--name", "x", "--count", "abc"], {
			context: null,
		});
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("expected a number");
	});

	test("invalid enum choice exits 2 listing the allowed choices", async () => {
		const run = await runForTest(buildGroup(), ["echo", "--name", "x", "--mode", "bogus"], {
			context: null,
		});
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("fast");
		expect(run.stderr).toContain("slow");
	});

	test("unknown subcommand exits 2", async () => {
		const run = await runForTest(buildGroup(), ["bogus"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).not.toBe("");
	});
});

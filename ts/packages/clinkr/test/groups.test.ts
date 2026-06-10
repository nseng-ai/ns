import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

interface ProbeContext {
	calls: string[];
}

function buildTree(): ClinkrGroup<ProbeContext> {
	const root = new ClinkrGroup<ProbeContext>({ name: "root", description: "Root group." });
	root.command({
		name: "top",
		schema: z.object({}),
		handler: async (ctx) => {
			ctx.calls.push("top");
			return ok({});
		},
	});
	const sub = new ClinkrGroup<ProbeContext>({ name: "sub", description: "Visible subgroup." });
	sub.command({
		name: "inner",
		schema: z.object({ x: z.number() }),
		handler: async (ctx, request) => {
			ctx.calls.push(`inner:${request.x}`);
			return ok({ x: request.x });
		},
	});
	root.group(sub);
	const exec = new ClinkrGroup<ProbeContext>({
		name: "exec",
		description: "Skill-invoked operations.",
		isHidden: true,
	});
	exec.command({
		name: "resolve",
		schema: z.object({}),
		handler: async (ctx) => {
			ctx.calls.push("resolve");
			return ok({ resolved: true });
		},
	});
	root.group(exec);
	return root;
}

describe("nested groups", () => {
	test("nested subgroup commands dispatch with parsed requests", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(buildTree(), ["sub", "inner", "--x", "1", "--format", "json"], {
			context,
		});
		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["inner:1"]);
		expect(parseEnvelope(run.stdout).data).toEqual({ x: 1 });
	});

	test("a bare group prints help to stdout and exits 0", async () => {
		const run = await runForTest(buildTree(), [], { context: { calls: [] } });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
		expect(run.stdout).toContain("Usage:");
		expect(run.stdout).toContain("top");
	});

	test("--help works at every level and exits 0", async () => {
		for (const argv of [["--help"], ["sub", "--help"], ["sub", "inner", "--help"]]) {
			const run = await runForTest(buildTree(), argv, { context: { calls: [] } });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("Usage:");
			expect(run.stderr).toBe("");
		}
	});
});

describe("hidden subgroups", () => {
	test("hidden subgroups are absent from parent help", async () => {
		const run = await runForTest(buildTree(), ["--help"], { context: { calls: [] } });
		expect(run.stdout).toContain("sub");
		expect(run.stdout).not.toContain("exec");
	});

	test("hidden subgroups stay invocable", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(buildTree(), ["exec", "resolve", "--format", "json"], {
			context,
		});
		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["resolve"]);
		expect(parseEnvelope(run.stdout).data).toEqual({ resolved: true });
	});
});

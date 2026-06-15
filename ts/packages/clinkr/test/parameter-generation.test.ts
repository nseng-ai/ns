import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

function echoGroup(): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command({
		name: "echo",
		schema: z.object({
			name: z.string(),
			count: z.number().default(1),
			dry_run: z.boolean().default(false),
			verbose: z.boolean().default(true),
			mode: z.enum(["fast", "slow"]).default("fast"),
			tags: z.array(z.string()).default([]),
		}),
		handler: async (_ctx, request) => ok(request),
	});
	return group;
}

async function echoedRequest(argv: readonly string[]): Promise<unknown> {
	const run = await runForTest(echoGroup(), [...argv, "--format", "json"], { context: null });
	expect(run.exitCode).toBe(0);
	return parseEnvelope(run.stdout).data;
}

describe("generated options end to end", () => {
	test("kebab-case flags map back to snake_case request keys", async () => {
		const request = await echoedRequest(["echo", "--name", "x", "--dry-run"]);
		expect(request).toMatchObject({ name: "x", dry_run: true });
	});

	test("absent options take their zod defaults", async () => {
		const request = await echoedRequest(["echo", "--name", "x"]);
		expect(request).toEqual({
			name: "x",
			count: 1,
			dry_run: false,
			verbose: true,
			mode: "fast",
			tags: [],
		});
	});

	test("number options parse to numbers", async () => {
		const request = await echoedRequest(["echo", "--name", "x", "--count", "5"]);
		expect(request).toMatchObject({ count: 5 });
	});

	test("default-true booleans expose a negation flag", async () => {
		const request = await echoedRequest(["echo", "--name", "x", "--no-verbose"]);
		expect(request).toMatchObject({ verbose: false });
	});

	test("string-array options accumulate across repeats", async () => {
		const request = await echoedRequest([
			"echo",
			"--name",
			"x",
			"--tags",
			"a",
			"--tags",
			"b",
		]);
		expect(request).toMatchObject({ tags: ["a", "b"] });
	});

	test("enum options accept declared choices", async () => {
		const request = await echoedRequest(["echo", "--name", "x", "--mode", "slow"]);
		expect(request).toMatchObject({ mode: "slow" });
	});

	test("--flag=value syntax works", async () => {
		const request = await echoedRequest(["echo", "--name=x", "--count=7"]);
		expect(request).toMatchObject({ name: "x", count: 7 });
	});
});

describe("positionals end to end", () => {
	function positionalGroup(): ClinkrGroup<null> {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "move",
			schema: z.object({
				source: z.string(),
				target: z.string(),
				force: z.boolean().default(false),
			}),
			positionals: { source: { position: 0 }, target: { position: 1 } },
			handler: async (_ctx, request) => ok(request),
		});
		return group;
	}

	test("positional values fill schema keys in declared order", async () => {
		const run = await runForTest(positionalGroup(), ["move", "a", "b", "--format", "json"], {
			context: null,
		});
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout).data).toEqual({ source: "a", target: "b", force: false });
	});

	test("positionals mix with named options", async () => {
		const run = await runForTest(
			positionalGroup(),
			["move", "a", "b", "--force", "--format", "json"],
			{ context: null },
		);
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout).data).toMatchObject({ force: true });
	});

	test("required positionals appear as <name> in help usage", async () => {
		const run = await runForTest(positionalGroup(), ["move", "--help"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("<source> <target>");
	});

	test("final string-array positionals collect repeated arguments", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "apply",
			schema: z.object({ kind: z.string(), skills: z.array(z.string()).min(1) }),
			positionals: { kind: { position: 0 }, skills: { position: 1 } },
			handler: async (_ctx, request) => ok(request),
		});

		const run = await runForTest(group, ["apply", "invoke-only", "a", "b", "--format", "json"], {
			context: null,
		});
		expect(run.exitCode).toBe(0);
		expect(parseEnvelope(run.stdout).data).toEqual({ kind: "invoke-only", skills: ["a", "b"] });
		const help = await runForTest(group, ["apply", "--help"], { context: null });
		expect(help.stdout).toContain("<kind> <skills...>");
	});
});

describe("generated help", () => {
	test("flag help text comes from describe() and surfaces defaults", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "echo",
			schema: z.object({
				name: z.string().describe("the plan name"),
				limit: z.number().default(10).describe("max items"),
			}),
			handler: async (_ctx, request) => ok(request),
		});
		const run = await runForTest(group, ["echo", "--help"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("--name <value>");
		expect(run.stdout).toContain("the plan name");
		expect(run.stdout).toContain("max items (default: 10)");
		expect(run.stdout).toContain("--format <format>");
		expect(run.stdout).toContain("--json-schema");
	});
});

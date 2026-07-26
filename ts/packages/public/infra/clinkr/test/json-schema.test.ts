import { z } from "zod";
import { describe, expect, test } from "vitest";

import { LegacyClinkrGroup, ok } from "../src/index.ts";
import { buildJsonSchemaDocument } from "../src/json-schema.ts";
import { runForTest } from "../src/testing/index.ts";

describe("buildJsonSchemaDocument", () => {
	test("emits input and output schemas", () => {
		const document = buildJsonSchemaDocument(
			z.object({ name: z.string() }),
			z.object({ created: z.boolean() }),
		);
		expect(Object.keys(document)).toEqual([
			"inputJsonSchema",
			"outputJsonSchema",
			"machineEnvelopeJsonSchema",
		]);
		expect(document.inputJsonSchema).toMatchObject({
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		});
		expect(document.outputJsonSchema).toMatchObject({
			type: "object",
			properties: { created: { type: "boolean" } },
		});
		expect(document.machineEnvelopeJsonSchema).toMatchObject({ anyOf: expect.any(Array) });
	});

	test("omitted usage schema publishes bodyless and framework-owned usage errors", () => {
		const document = buildJsonSchemaDocument(z.object({}), undefined);
		expect(document.outputJsonSchema).toEqual({});
		const machineText = JSON.stringify(document.machineEnvelopeJsonSchema);
		expect(machineText).toContain('"commanderCode"');
		expect(machineText).toContain('"issues"');
		expect(machineText).toContain('"path"');
		expect(machineText).toContain('"message"');
		expect(machineText).toContain('"code"');
		expect(machineText).toContain('"surface"');
		expect(machineText).toContain('"required":["status","exitCode","errorType","message"]');
	});

	test("publishes independent data schemas for all four statuses", () => {
		const document = buildJsonSchemaDocument(z.object({}), {
			resultSchema: z.object({ result: z.string() }),
			negativeSchema: z.object({ searched: z.string() }),
			failureSchema: z.object({ service: z.string() }),
			usageErrorSchema: z.object({ flag: z.string() }),
		});
		const machineText = JSON.stringify(document.machineEnvelopeJsonSchema);
		expect(machineText).toContain('"result"');
		expect(machineText).toContain('"searched"');
		expect(machineText).toContain('"service"');
		expect(machineText).toContain('"flag"');
		expect(machineText).toContain('"commanderCode"');
		expect(machineText).toContain('"issues"');
	});
});

describe("--json-schema flag", () => {
	function buildGroup(): LegacyClinkrGroup<null> {
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "make",
			schema: z.object({ name: z.string().describe("the name") }),
			resultSchema: z.object({ created: z.boolean() }),
			handler: async (_ctx, _request) => ok({ created: true }),
		});
		return group;
	}

	test("prints the schema document and exits 0", async () => {
		const run = await runForTest(buildGroup(), ["make", "--json-schema"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
		const document = JSON.parse(run.stdout) as Record<string, unknown>;
		expect(Object.keys(document)).toEqual([
			"inputJsonSchema",
			"outputJsonSchema",
			"machineEnvelopeJsonSchema",
		]);
	});

	test("is eager: runs before required-argument validation", async () => {
		// `--name` is required but missing; the schema must still print.
		const run = await runForTest(buildGroup(), ["make", "--json-schema"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
	});

	test("emits the plain document even alongside --format json", async () => {
		const run = await runForTest(buildGroup(), ["make", "--json-schema", "--format", "json"], {
			context: null,
		});
		expect(run.exitCode).toBe(0);
		const document = JSON.parse(run.stdout) as Record<string, unknown>;
		expect(document).not.toHaveProperty("exitCode");
		expect(document).toHaveProperty("inputJsonSchema");
	});

	test("the handler does not run", async () => {
		let invoked = false;
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "make",
			schema: z.object({}),
			handler: async () => {
				invoked = true;
				return ok({});
			},
		});
		await runForTest(group, ["make", "--json-schema"], { context: null });
		expect(invoked).toBe(false);
	});
});

describe("schemaDocument override", () => {
	const pinnedDocument = {
		inputJsonSchema: { type: "object", title: "pinned input" },
		outputJsonSchema: { type: "object", title: "pinned output" },
		machineEnvelopeJsonSchema: { type: "object", title: "pinned envelope" },
	};

	function buildGroup(): LegacyClinkrGroup<null> {
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "make",
			schema: z.object({ name: z.string() }),
			resultSchema: z.object({ created: z.boolean() }),
			schemaDocument: () => pinnedDocument,
			handler: async () => ok({ created: true }),
		});
		return group;
	}

	test("serves the override document verbatim", async () => {
		const run = await runForTest(buildGroup(), ["make", "--json-schema"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
		expect(JSON.parse(run.stdout)).toEqual(pinnedDocument);
	});

	test("stays eager: serves the override before required-argument validation", async () => {
		// `--name` is required but missing; the override must still print.
		const run = await runForTest(buildGroup(), ["make", "--json-schema"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
	});

	test("absent override keeps generated documents", async () => {
		const group = new LegacyClinkrGroup<null>({ name: "probe" });
		group.command({
			name: "make",
			schema: z.object({ name: z.string() }),
			resultSchema: z.object({ created: z.boolean() }),
			handler: async () => ok({ created: true }),
		});
		const run = await runForTest(group, ["make", "--json-schema"], { context: null });
		expect(run.exitCode).toBe(0);
		const document = JSON.parse(run.stdout) as Record<string, unknown>;
		expect(document["inputJsonSchema"]).toMatchObject({
			type: "object",
			required: ["name"],
		});
		expect(document["outputJsonSchema"]).toMatchObject({ type: "object" });
	});
});

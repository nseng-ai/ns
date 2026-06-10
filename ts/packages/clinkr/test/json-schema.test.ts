import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { buildJsonSchemaDocument } from "../src/json-schema.ts";
import { runForTest } from "../src/testing/index.ts";

describe("buildJsonSchemaDocument", () => {
	test("emits input and output schemas", () => {
		const document = buildJsonSchemaDocument(
			z.object({ name: z.string() }),
			z.object({ created: z.boolean() }),
		);
		expect(Object.keys(document)).toEqual(["input_json_schema", "output_json_schema"]);
		expect(document.input_json_schema).toMatchObject({
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		});
		expect(document.output_json_schema).toMatchObject({
			type: "object",
			properties: { created: { type: "boolean" } },
		});
	});

	test("an absent result schema yields the anything schema", () => {
		const document = buildJsonSchemaDocument(z.object({}), undefined);
		expect(document.output_json_schema).toEqual({});
	});
});

describe("--json-schema flag", () => {
	function buildGroup(): ClinkrGroup<null> {
		const group = new ClinkrGroup<null>({ name: "probe" });
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
		expect(Object.keys(document)).toEqual(["input_json_schema", "output_json_schema"]);
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
		expect(document).not.toHaveProperty("exit_code");
		expect(document).toHaveProperty("input_json_schema");
	});

	test("the handler does not run", async () => {
		let invoked = false;
		const group = new ClinkrGroup<null>({ name: "probe" });
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

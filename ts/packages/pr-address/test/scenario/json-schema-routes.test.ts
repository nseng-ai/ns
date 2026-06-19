import { describe, expect, test } from "vitest";

import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { runScenario } from "../support/run-scenario.ts";

const OPERATION_NAMES = [...EXEC_OPERATION_NAMES].sort();

async function serveSchemaDocument(operation: string): Promise<Record<string, unknown>> {
	const run = runScenario(["exec", operation, "--json-schema"]);
	expect(await run.exit).toBe(0);
	expect(run.stderr.join("")).toBe("");
	const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
	expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	return document;
}

describe("pr-address exec --json-schema routes", () => {
	for (const operation of OPERATION_NAMES) {
		test(`${operation} serves a useful canonical schema document`, async () => {
			const document = await serveSchemaDocument(operation);
			expect(document["input_json_schema"]).toEqual(expect.objectContaining({ type: "object" }));
			expect(document["output_json_schema"]).toEqual(expect.objectContaining({ type: "object" }));
			expect(document["output_json_schema"]).not.toEqual({});
		});
	}

	test("--json-schema short-circuits before argument validation", async () => {
		const run = runScenario(["exec", "download-feedback", "--json-schema", "--format", "json"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});

	test("--json-schema for unknown operations is a clinkr usage error", async () => {
		const run = runScenario(["exec", "not-a-real-operation", "--json-schema"]);
		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("error: unknown command 'not-a-real-operation'\n");
	});
});

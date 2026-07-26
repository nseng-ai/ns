import { describe, expect, test } from "vitest";

import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { runScenario } from "../support/run-scenario.ts";

const OPERATION_NAMES = [...EXEC_OPERATION_NAMES].sort();

async function serveSchemaDocument(operation: string): Promise<Record<string, unknown>> {
	const run = runScenario(["exec", operation, "--json-schema"]);
	expect(await run.exit).toBe(0);
	expect(run.stderr.join("")).toBe("");
	const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
	expect(Object.keys(document).sort()).toEqual([
		"inputJsonSchema",
		"machineEnvelopeJsonSchema",
		"outputJsonSchema",
	]);
	return document;
}

describe("ns address exec --json-schema routes", () => {
	for (const operation of OPERATION_NAMES) {
		test(`${operation} serves a useful canonical schema document`, async () => {
			const document = await serveSchemaDocument(operation);
			expect(document["inputJsonSchema"]).toEqual(expect.objectContaining({ type: "object" }));
			expect(document["outputJsonSchema"]).toEqual(expect.objectContaining({ type: "object" }));
			expect(document["outputJsonSchema"]).not.toEqual({});
		});
	}

	test("branch-pr-checks publishes every additive enriched field", async () => {
		const document = await serveSchemaDocument("branch-pr-checks");
		const outputSchema = JSON.stringify(document["outputJsonSchema"]);
		for (const field of [
			"pr_status",
			"head_commit_committed_at",
			"review_threads",
			"freshness",
			"is_trailing",
		]) {
			expect(outputSchema).toContain(`"${field}"`);
		}
	});

	test("wait-for-checks publishes the same enriched branch-entry fields", async () => {
		const document = await serveSchemaDocument("wait-for-checks");
		const outputSchema = JSON.stringify(document["outputJsonSchema"]);
		expect(outputSchema).toContain('"head_commit_committed_at"');
		expect(outputSchema).toContain('"freshness"');
		expect(outputSchema).toContain('"is_trailing"');
	});

	test("--json-schema short-circuits before argument validation", async () => {
		const run = runScenario(["exec", "download-feedback", "--json-schema", "--format", "json"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual([
			"inputJsonSchema",
			"machineEnvelopeJsonSchema",
			"outputJsonSchema",
		]);
	});

	test("--json-schema for unknown operations is a clinkr usage error", async () => {
		const run = runScenario(["exec", "not-a-real-operation", "--json-schema"]);
		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toBe("error: unknown command 'not-a-real-operation'\n");
	});
});

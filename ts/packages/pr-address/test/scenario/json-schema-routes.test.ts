import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { collectSchemaContractMismatches } from "../support/json-schema-contract.ts";
import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { runScenario } from "../support/run-scenario.ts";

const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/json-schemas/", import.meta.url));

// Operations whose schema documents are locked against captured schema contract
// fixtures. Fixture input schemas for stack-feedback-diff-current,
// build-stack-resolve-thread-payloads, and build-resolve-thread-batch-payload
// additionally carry TypeScript-owned option fields (payload_file and artifact
// reference options) that intentionally extend the operation contract.
const CONTRACT_LOCKED_OPERATIONS = [
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"finalize-run",

	"read-feedback-detail",
	"read-feedback-details",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",

	"summarize-feedback",
] as const;

// The classification trio shipped TypeScript-owned schema documents before this
// sweep with looser zod contracts; they are asserted as TS-served here but are
// not held to the structural contract comparator (pre-existing dialect/coverage gaps).
const PRE_EXISTING_TS_SCHEMA_OPERATIONS = ["classification-template", "validate-feedback-classification", "plan-feedback"] as const;

// TypeScript-owned operations that are checked by exact captured fixtures rather
// than the structural contract comparator.
const TS_ONLY_OPERATIONS = ["get-feedback", "map-branch-prs", "prepare-run", "record-batch-checkpoint", "stack-feedback-plan", "stack-feedback-preflight", "stack-feedback-prep", "stack-feedback-thread-state"] as const;

async function readFixture(operation: string): Promise<{ input_json_schema: unknown; output_json_schema: unknown }> {
	const raw = await readFile(join(FIXTURE_ROOT, `${operation}.json`), "utf8");
	return JSON.parse(raw) as { input_json_schema: unknown; output_json_schema: unknown };
}

async function serveSchemaDocument(operation: string): Promise<Record<string, unknown>> {
	const run = runScenario(["exec", operation, "--json-schema"]);
	expect(await run.exit).toBe(0);
	expect(run.stderr.join("")).toBe("");
	const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
	expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	return document;
}

describe("pr-address exec --json-schema routes", () => {
	test("the sweep covers every registered exec operation exactly once", () => {
		// Total-coverage guard: a new operation cannot ship without joining one
		// of the sweep buckets, so every --json-schema route stays covered by
		// the TypeScript schema registry.
		const sweepNames = [...CONTRACT_LOCKED_OPERATIONS, ...PRE_EXISTING_TS_SCHEMA_OPERATIONS, ...TS_ONLY_OPERATIONS].sort();
		expect(sweepNames).toEqual([...EXEC_OPERATION_NAMES].sort());
	});

	for (const operation of CONTRACT_LOCKED_OPERATIONS) {
		test(`${operation} serves a TypeScript schema document matching the captured schema contract`, async () => {
			const document = await serveSchemaDocument(operation);
			const fixture = await readFixture(operation);
			expect(collectSchemaContractMismatches(document["input_json_schema"], fixture.input_json_schema)).toEqual([]);
			expect(collectSchemaContractMismatches(document["output_json_schema"], fixture.output_json_schema)).toEqual([]);
		});
	}

	for (const operation of PRE_EXISTING_TS_SCHEMA_OPERATIONS) {
		test(`${operation} serves its schema document from the TypeScript registry`, async () => {
			await serveSchemaDocument(operation);
		});
	}

	for (const operation of TS_ONLY_OPERATIONS) {
		test(`${operation} serves its TypeScript-owned schema document matching the captured fixture`, async () => {
			const document = await serveSchemaDocument(operation);
			const fixture = await readFixture(operation);
			expect(document).toEqual(fixture);
		});
	}

	test("--json-schema short-circuits before argument validation", async () => {
		const run = runScenario(["exec", "resolve-thread-with-reply", "--json-schema", "--format", "json"]);
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

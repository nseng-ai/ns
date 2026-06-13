import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { EXEC_OPERATION_NAMES } from "../../src/exec-commands.ts";
import { collectSchemaParityMismatches } from "../support/json-schema-parity.ts";
import { runScenarioWithLegacy, type ScenarioRunWithLegacy } from "../support/run-scenario.ts";

const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/json-schemas/", import.meta.url));

// Operations whose schema documents were ported in this slice and must hold
// structural semantic parity with the captured Python (Pydantic) fixtures.
// Fixture input schemas for stack-feedback-plan, stack-feedback-prep,
// stack-feedback-diff-current, build-stack-resolve-thread-payloads, and
// build-resolve-thread-batch-payload additionally carry TypeScript-owned option
// fields (payload_file and artifact reference options) that intentionally extend
// the original Python contract.
const PARITY_OPERATIONS = [
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"finalize-run",
	"get-feedback",
	"prepare-run",
	"read-feedback-detail",
	"read-feedback-details",
	"record-batch-checkpoint",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",
	"stack-feedback-plan",
	"stack-feedback-prep",
	"summarize-feedback",
] as const;

// The classification trio shipped TypeScript-owned schema documents before this
// slice with looser zod contracts; they are asserted as TS-served here but are
// not held to the structural parity bar (pre-existing dialect/coverage gaps).
const PRE_EXISTING_TS_SCHEMA_OPERATIONS = ["classification-template", "validate-feedback-classification", "plan-feedback"] as const;

// TypeScript-only operations with no Python counterpart; their fixtures are
// captured from the TypeScript `--json-schema` output, not Python parity.
const TS_ONLY_OPERATIONS = ["map-branch-prs", "stack-feedback-preflight"] as const;

function runWithFakeLegacy(args: readonly string[]): ScenarioRunWithLegacy {
	return runScenarioWithLegacy(args);
}

async function readFixture(operation: string): Promise<{ input_json_schema: unknown; output_json_schema: unknown }> {
	const raw = await readFile(join(FIXTURE_ROOT, `${operation}.json`), "utf8");
	return JSON.parse(raw) as { input_json_schema: unknown; output_json_schema: unknown };
}

async function serveSchemaDocument(operation: string): Promise<Record<string, unknown>> {
	const run = runWithFakeLegacy(["exec", operation, "--json-schema"]);
	expect(await run.exit).toBe(0);
	expect(run.stderr.join("")).toBe("");
	expect(run.legacy.calls).toEqual([]);
	const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
	expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	return document;
}

describe("pr-address exec --json-schema routes", () => {
	test("the sweep covers every registered exec operation exactly once", () => {
		// Total-coverage guard: a new operation cannot ship without joining one
		// of the sweep buckets, so no --json-schema route can silently regress
		// to the legacy CLI.
		const sweepNames = [...PARITY_OPERATIONS, ...PRE_EXISTING_TS_SCHEMA_OPERATIONS, ...TS_ONLY_OPERATIONS].sort();
		expect(sweepNames).toEqual([...EXEC_OPERATION_NAMES].sort());
	});

	for (const operation of PARITY_OPERATIONS) {
		test(`${operation} serves a TypeScript schema document with structural parity to Python`, async () => {
			const document = await serveSchemaDocument(operation);
			const fixture = await readFixture(operation);
			expect(collectSchemaParityMismatches(document["input_json_schema"], fixture.input_json_schema)).toEqual([]);
			expect(collectSchemaParityMismatches(document["output_json_schema"], fixture.output_json_schema)).toEqual([]);
		});
	}

	for (const operation of PRE_EXISTING_TS_SCHEMA_OPERATIONS) {
		test(`${operation} serves its schema document without legacy fallback`, async () => {
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

	test("--json-schema short-circuits before argument validation like the eager Python flag", async () => {
		const run = runWithFakeLegacy(["exec", "resolve-thread-with-reply", "--json-schema", "--format", "json"]);
		expect(await run.exit).toBe(0);
		expect(run.legacy.calls).toEqual([]);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});

	test("--json-schema for unknown operations still delegates to legacy", async () => {
		const run = runWithFakeLegacy(["exec", "not-a-real-operation", "--json-schema"]);
		expect(await run.exit).toBe(0);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "not-a-real-operation", "--json-schema"]]);
	});
});

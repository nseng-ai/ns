import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { collectSchemaParityMismatches } from "../support/json-schema-parity.ts";

const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/json-schemas/", import.meta.url));

// Operations whose schema documents were ported in this slice and must hold
// structural semantic parity with the captured Python (Pydantic) fixtures.
const PARITY_OPERATIONS = [
	"add-issue-comment",
	"add-reaction",
	"add-review-thread-reply",
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"finalize-run",
	"get-discussion-comments",
	"get-feedback",
	"get-pr-for-branch",
	"get-review-comments",
	"get-reviews",
	"prepare-run",
	"read-feedback-detail",
	"read-feedback-details",
	"record-batch-checkpoint",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",
	"stack-feedback-plan",
	"stack-feedback-prep",
	"summarize-feedback",
	"unresolve-thread",
] as const;

// The classification trio shipped TypeScript-owned schema documents before this
// slice with looser zod contracts; they are asserted as TS-served here but are
// not held to the structural parity bar (pre-existing dialect/coverage gaps).
const PRE_EXISTING_TS_SCHEMA_OPERATIONS = ["classification-template", "validate-feedback-classification", "plan-feedback"] as const;

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

function runSchemaRoute(args: readonly string[]): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: {},
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

async function readFixture(operation: string): Promise<{ input_json_schema: unknown; output_json_schema: unknown }> {
	const raw = await readFile(join(FIXTURE_ROOT, `${operation}.json`), "utf8");
	return JSON.parse(raw) as { input_json_schema: unknown; output_json_schema: unknown };
}

async function serveSchemaDocument(operation: string): Promise<Record<string, unknown>> {
	const run = runSchemaRoute(["exec", operation, "--json-schema"]);
	expect(await run.exit).toBe(0);
	expect(run.stderr.join("")).toBe("");
	const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
	expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	return document;
}

describe("pr-address exec --json-schema routes", () => {
	for (const operation of PARITY_OPERATIONS) {
		test(`${operation} serves a TypeScript schema document with structural parity to Python`, async () => {
			const document = await serveSchemaDocument(operation);
			const fixture = await readFixture(operation);
			expect(collectSchemaParityMismatches(document["input_json_schema"], fixture.input_json_schema)).toEqual([]);
			expect(collectSchemaParityMismatches(document["output_json_schema"], fixture.output_json_schema)).toEqual([]);
		});
	}

	for (const operation of PRE_EXISTING_TS_SCHEMA_OPERATIONS) {
		test(`${operation} serves its schema document from TypeScript`, async () => {
			await serveSchemaDocument(operation);
		});
	}

	test("--json-schema short-circuits before argument validation like the eager Python flag", async () => {
		const run = runSchemaRoute(["exec", "resolve-thread", "--json-schema", "--format", "json"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});

	test("--json-schema for unknown operations reports an unknown-operation error", async () => {
		const run = runSchemaRoute(["exec", "not-a-real-operation", "--json-schema"]);
		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Unknown operation: not-a-real-operation");
	});
});

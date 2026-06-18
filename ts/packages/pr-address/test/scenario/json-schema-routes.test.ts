import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { EXEC_OPERATION_NAMES } from "../support/operation-names.ts";
import { runScenario } from "../support/run-scenario.ts";

const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/json-schemas/", import.meta.url));
const OPERATION_NAMES = [...EXEC_OPERATION_NAMES].sort();

async function readFixture(
	operation: string,
): Promise<{ input_json_schema: unknown; output_json_schema: unknown }> {
	const raw = await readFile(join(FIXTURE_ROOT, `${operation}.json`), "utf8");
	return JSON.parse(raw) as { input_json_schema: unknown; output_json_schema: unknown };
}

async function fixtureOperationNames(): Promise<string[]> {
	const entries = await readdir(FIXTURE_ROOT);
	return entries
		.filter((entry) => extname(entry) === ".json")
		.map((entry) => basename(entry, ".json"))
		.sort();
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
	test("fixture basenames match every registered exec operation", async () => {
		expect(await fixtureOperationNames()).toEqual(OPERATION_NAMES);
	});

	for (const operation of OPERATION_NAMES) {
		test(`${operation} serves its exact TypeScript schema fixture`, async () => {
			const document = await serveSchemaDocument(operation);
			const fixture = await readFixture(operation);
			expect(document).toEqual(fixture);
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

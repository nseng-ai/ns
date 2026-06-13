import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

interface BuildStackResolveThreadPayloadsCase {
	name: string;
	payload_json_template: string;
	expected_exit_code: number;
	expected_envelope_text: string;
}

interface BuildStackResolveThreadPayloadsFixture {
	cases: BuildStackResolveThreadPayloadsCase[];
}

const fixture = JSON.parse(
	await readFile(new URL("../fixtures/stack-orchestration/build-stack-resolve-thread-payloads.json", import.meta.url), "utf8"),
) as BuildStackResolveThreadPayloadsFixture;

const makeScopedTempDir = useTempDirs();

async function makeTempDir(): Promise<string> {
	return makeScopedTempDir("pr-address-stack-resolve-");
}

function requiredCase(name: string): BuildStackResolveThreadPayloadsCase {
	const fixtureCase = fixture.cases.find((candidate) => candidate.name === name);
	if (fixtureCase === undefined) throw new Error(`Missing build-stack-resolve-thread-payloads fixture case: ${name}`);
	return fixtureCase;
}

describe("build-stack-resolve-thread-payloads parity with the Python CLI", () => {
	for (const buildCase of fixture.cases) {
		test(`matches the Python envelope for ${buildCase.name}`, async () => {
			// Payload paths embedded in the stack plan input are inert; the literal
			// {ROOT} placeholder matches the sanitized payload used for generation.
			const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--payload-json", buildCase.payload_json_template, "--format", "json"]);

			expect(await run.exit).toBe(buildCase.expected_exit_code);
			expect(run.stdout.join("")).toBe(buildCase.expected_envelope_text);
		});
	}

	test("reports invalid_json for malformed payloads", async () => {
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--payload-json", "{", "--format", "json"]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string };
		expect(envelope.error_type).toBe("invalid_json");
	});

	test("rejects unknown options with a commander usage error", async () => {
		// PINNED CLINKR SEMANTICS: unknown options are a raw commander usage
		// error (stderr, exit 2), never a machine envelope — click parity.
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown option '--bogus'\n");
	});

	test("accepts --payload-file for the full payload", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const dir = await makeTempDir();
		const payloadPath = join(dir, "payload.json");
		await writeFile(payloadPath, happyCase.payload_json_template, "utf8");

		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--payload-file", payloadPath, "--format", "json"]);

		expect(await run.exit).toBe(happyCase.expected_exit_code);
		expect(run.stdout.join("")).toBe(happyCase.expected_envelope_text);
	});

	test("builds from --stack-plan-reference plus a payload without stack_plan", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const { stack_plan: stackPlan, ...payloadRest } = JSON.parse(happyCase.payload_json_template) as { stack_plan: unknown } & Record<string, unknown>;
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan), "utf8");

		const run = runScenario([
			"exec",
			"build-stack-resolve-thread-payloads",
			"--stack-plan-reference",
			planPath,
			"--payload-json",
			JSON.stringify(payloadRest),
			"--format",
			"json",
		]);

		expect(await run.exit).toBe(happyCase.expected_exit_code);
		expect(run.stdout.join("")).toBe(happyCase.expected_envelope_text);
	});

	test("rejects --stack-plan-reference combined with an embedded stack_plan key", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const { stack_plan: stackPlan } = JSON.parse(happyCase.payload_json_template) as { stack_plan: unknown };
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan), "utf8");

		const run = runScenario([
			"exec",
			"build-stack-resolve-thread-payloads",
			"--stack-plan-reference",
			planPath,
			"--payload-json",
			happyCase.payload_json_template,
			"--format",
			"json",
		]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded stack_plan payload key with --stack-plan-reference");
	});

	test("rejects --payload-json combined with --payload-file", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const dir = await makeTempDir();
		const payloadPath = join(dir, "payload.json");
		await writeFile(payloadPath, happyCase.payload_json_template, "utf8");

		const run = runScenario([
			"exec",
			"build-stack-resolve-thread-payloads",
			"--payload-json",
			happyCase.payload_json_template,
			"--payload-file",
			payloadPath,
			"--format",
			"json",
		]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("only one");
	});

	test("rejects missing, malformed, and wrong-shape --stack-plan-reference files", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const { stack_plan: _stackPlan, ...payloadRest } = JSON.parse(happyCase.payload_json_template) as { stack_plan: unknown } & Record<string, unknown>;
		const payloadJson = JSON.stringify(payloadRest);
		const dir = await makeTempDir();

		const missingRun = runScenario(["exec", "build-stack-resolve-thread-payloads", "--stack-plan-reference", join(dir, "missing.json"), "--payload-json", payloadJson, "--format", "json"]);
		expect(await missingRun.exit).toBe(2);
		const missingEnvelope = JSON.parse(missingRun.stdout.join("")) as { error_type: string; message: string };
		expect(missingEnvelope.error_type).toBe("invalid_request");
		expect(missingEnvelope.message).toContain("must point to an existing file");

		const malformedPath = join(dir, "broken.json");
		await writeFile(malformedPath, "{", "utf8");
		const malformedRun = runScenario(["exec", "build-stack-resolve-thread-payloads", "--stack-plan-reference", malformedPath, "--payload-json", payloadJson, "--format", "json"]);
		expect(await malformedRun.exit).toBe(2);
		expect((JSON.parse(malformedRun.stdout.join("")) as { error_type: string }).error_type).toBe("invalid_json");

		const wrongShapePath = join(dir, "stack-prep.json");
		await writeFile(wrongShapePath, JSON.stringify({ stack: [], summary: {} }), "utf8");
		const wrongShapeRun = runScenario(["exec", "build-stack-resolve-thread-payloads", "--stack-plan-reference", wrongShapePath, "--payload-json", payloadJson, "--format", "json"]);
		expect(await wrongShapeRun.exit).toBe(1);
		const wrongShapeEnvelope = JSON.parse(wrongShapeRun.stdout.join("")) as { data: { errors: Array<{ code: string }> } };
		expect(wrongShapeEnvelope.data.errors.map((error) => error.code)).toContain("invalid_stack_plan_shape");
	});

	test("serves --json-schema from TypeScript without invoking the legacy CLI", async () => {
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--json-schema"]);

		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});
});

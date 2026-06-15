import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { InMemoryPayloadStoreFactory, PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor } from "../../src/session-artifacts.ts";
import { asWrapperInput, GOLDEN_V1_ROOT, REPO_ROOT, readJson } from "../support/golden.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectPayloadOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

describe("managed classification/planning CLI operations", () => {
	test("classification-template accepts stdin, inline JSON, and file JSON without legacy fallback", async () => {
		const input = await readJson(join(GOLDEN_V1_ROOT, "classification-template/classification-template-rich-manifest/input.json"));
		if (typeof input !== "object" || input === null || !("manifest" in input)) throw new TypeError("classification-template input must include manifest");
		const manifest = JSON.stringify((input as { manifest: unknown }).manifest);

		const stdinRun = runScenario(["exec", "classification-template", "--format", "json"], { cwd: REPO_ROOT, stdin: async () => manifest });
		expect(await stdinRun.exit).toBe(0);
		expect(JSON.parse(stdinRun.stdout.join("")).data.manifest_kind).toBe("prepare_run");

		const inlineRun = runScenario(["exec", "classification-template", "--manifest-json", manifest, "--format", "json"], { cwd: REPO_ROOT });
		expect(await inlineRun.exit).toBe(0);
		expect(JSON.parse(inlineRun.stdout.join("")).data.counts.review_threads).toBe(1);

		const tempDir = await makeTempDir("pr-address-classification-");
		const manifestPath = join(tempDir, "manifest.json");
		await writeFile(manifestPath, manifest, "utf8");
		const fileRun = runScenario(["exec", "classification-template", "--manifest-file", manifestPath, "--format", "json"], { cwd: REPO_ROOT });
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.counts.resolved_review_threads_omitted).toBe(1);
	});

	test("classification-template resolves latest manifest by PR number", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json")));
		const root = join(await makeTempDir("pr-address-classification-"), "payload-root");
		const sessionId = "session-template";
		const prNumber = 42;
		const store = expectPayloadOk(await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-06-09T08:30:00Z") }));
		expectPayloadOk(
			await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber, kind: "manifest" }), role: "summary", payload: input.manifest }),
		);

		let stdinWasRead = false;
		const run = runScenario(["exec", "classification-template", "--pr-number", String(prNumber), "--format", "json"], {
			cwd: REPO_ROOT,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: sessionId },
			stdin: async () => {
				stdinWasRead = true;
				return JSON.stringify({ should_not: "be read" });
			},
		});
		expect(await run.exit).toBe(0);
		expect(stdinWasRead).toBe(false);
		const envelope = JSON.parse(run.stdout.join("")) as {
			data: {
				counts: { reviews: number; review_threads: number; discussion_comments: number };
				classification_template: { schema_version: number };
				resolved_inputs: { manifest: { descriptor: string; role: string; sequence: number } };
				classification_template_reference?: unknown;
			};
		};
		expect(envelope.data.counts).toMatchObject({ reviews: 1, review_threads: 1, discussion_comments: 1 });
		expect(envelope.data.classification_template.schema_version).toBe(1);
		expect(envelope.data.resolved_inputs.manifest).toMatchObject({ descriptor: "pr-address-pr-42-manifest", role: "summary", sequence: 1 });
		expect(envelope.data.classification_template_reference).toBeUndefined();
	});

	test("classification-template rejects mixed session and manifest input", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json")));
		const run = runScenario(
			["exec", "classification-template", "--pr-number", "42", "--manifest-json", JSON.stringify(input.manifest), "--format", "json"],
			{ cwd: REPO_ROOT },
		);
		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix session resolution");
	});

	test("managed operations serve JSON schema documents", async () => {
		for (const operation of ["classification-template", "validate-feedback-classification", "plan-feedback"]) {
			const run = runScenario(["exec", operation, "--json-schema"], { cwd: REPO_ROOT });
			expect(await run.exit).toBe(0);
			const schemaDocument = JSON.parse(run.stdout.join(""));
			expect(Object.keys(schemaDocument).sort()).toEqual(["input_json_schema", "output_json_schema"]);
			expect(run.stderr.join("")).toBe("");
		}
	});

	test("plan-feedback returns managed JSON envelopes for wrapper input", async () => {
		const inputPath = join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");

		const planRun = runScenario(["exec", "plan-feedback", "--payload-json", payload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await planRun.exit).toBe(0);
		expect(JSON.parse(planRun.stdout.join("")).data.valid).toBe(true);
	});

	test("plan-feedback accepts --payload-file and rejects mixed payload sources", async () => {
		const inputPath = join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");
		const tempDir = await makeTempDir("pr-address-classification-");
		const payloadPath = join(tempDir, "wrapper-payload.json");
		await writeFile(payloadPath, payload, "utf8");

		const fileRun = runScenario(["exec", "plan-feedback", "--payload-file", payloadPath, "--format", "json"], { cwd: REPO_ROOT });
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.valid).toBe(true);

		const conflictRun = runScenario(["exec", "plan-feedback", "--payload-json", payload, "--payload-file", payloadPath, "--format", "json"], { cwd: REPO_ROOT });
		expect(await conflictRun.exit).toBe(2);
		const conflictEnvelope = JSON.parse(conflictRun.stdout.join(""));
		expect(conflictEnvelope.error_type).toBe("invalid_request");
		expect(conflictEnvelope.message).toContain("--payload-file");
	});

	test("validate-feedback-classification resolves manifest by PR number and auto-persists classification", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json")));
		const root = join(await makeTempDir("pr-address-classification-"), "payload-root");
		const sessionId = "session-validate";
		const prNumber = 42;
		const store = expectPayloadOk(await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-06-09T08:30:00Z") }));
		expectPayloadOk(
			await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber, kind: "manifest" }), role: "summary", payload: input.manifest }),
		);
		const env = { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: sessionId };
		const tempDir = await makeTempDir("pr-address-classification-");
		const classificationPath = join(tempDir, "classification.json");
		await writeFile(classificationPath, JSON.stringify(input.classification), "utf8");

		const validateRun = runScenario(
			[
				"exec",
				"validate-feedback-classification",
				"--pr-number",
				String(prNumber),
				"--classification-file",
				classificationPath,
				"--format",
				"json",
			],
			{ cwd: REPO_ROOT, env, payloadClock: fixedClock("2026-06-09T08:30:01Z") },
		);
		expect(await validateRun.exit).toBe(0);
		const validateEnvelope = JSON.parse(validateRun.stdout.join("")) as {
			data: {
				valid: boolean;
				resolved_inputs: { manifest: { descriptor: string; sequence: number } };
				classification_reference: { descriptor: string; role: string; sequence: number };
			};
		};
		expect(validateEnvelope.data.valid).toBe(true);
		expect(validateEnvelope.data.resolved_inputs.manifest).toMatchObject({ descriptor: "pr-address-pr-42-manifest", sequence: 1 });
		expect(validateEnvelope.data.classification_reference).toMatchObject({ descriptor: "pr-address-pr-42-classification", role: "summary", sequence: 2 });

		const planRun = runScenario(["exec", "plan-feedback", "--pr-number", String(prNumber), "--format", "json"], {
			cwd: REPO_ROOT,
			env,
			payloadClock: fixedClock("2026-06-09T08:30:02Z"),
		});
		expect(await planRun.exit).toBe(0);
		const planEnvelope = JSON.parse(planRun.stdout.join("")) as {
			data: {
				valid: boolean;
				resolved_inputs: { manifest: { descriptor: string; sequence: number }; classification: { descriptor: string; sequence: number } };
				plan_reference: { descriptor: string; sequence: number };
			};
		};
		expect(planEnvelope.data.valid).toBe(true);
		expect(planEnvelope.data.resolved_inputs.manifest).toMatchObject({ descriptor: "pr-address-pr-42-manifest", sequence: 1 });
		expect(planEnvelope.data.resolved_inputs.classification).toMatchObject({ descriptor: "pr-address-pr-42-classification", sequence: 2 });
		expect(planEnvelope.data.plan_reference).toMatchObject({ descriptor: "pr-address-pr-42-plan", sequence: 3 });
	});

	test("validate-feedback-classification session mode rejects missing classification source", async () => {
		const missingRun = runScenario(["exec", "validate-feedback-classification", "--pr-number", "42", "--format", "json"], { cwd: REPO_ROOT });
		expect(await missingRun.exit).toBe(2);
		const missingEnvelope = JSON.parse(missingRun.stdout.join(""));
		expect(missingEnvelope.error_type).toBe("invalid_request");
		expect(missingEnvelope.message).toContain("requires exactly one classification source");
	});

	test("plan-feedback resolves and writes session artifacts through an injected in-memory payload store", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json")));
		const root = "/tmp/pr-address-in-memory-payload-root";
		const sessionId = "session-plan";
		const prNumber = 42;
		const factory = new InMemoryPayloadStoreFactory();
		const store = expectPayloadOk(await factory.open({ root, sessionId, clock: fixedClock("2026-06-09T08:30:00Z") }));
		expectPayloadOk(
			await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber, kind: "manifest" }), role: "summary", payload: input.manifest }),
		);
		const env = { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: sessionId };

		const validateRun = runScenario(
			[
				"exec",
				"validate-feedback-classification",
				"--pr-number",
				String(prNumber),
				"--classification-json",
				JSON.stringify(input.classification),
				"--format",
				"json",
			],
			{ cwd: REPO_ROOT, env, payloadClock: fixedClock("2026-06-09T08:30:01Z"), payloadStoreFactory: factory },
		);
		expect(await validateRun.exit).toBe(0);
		const validateEnvelope = JSON.parse(validateRun.stdout.join("")) as {
			data: { resolved_inputs: { manifest: { descriptor: string; sequence: number } }; classification_reference: { descriptor: string; sequence: number } };
		};
		expect(validateEnvelope.data.resolved_inputs.manifest).toMatchObject({ descriptor: "pr-address-pr-42-manifest", sequence: 1 });
		expect(validateEnvelope.data.classification_reference).toMatchObject({ descriptor: "pr-address-pr-42-classification", sequence: 2 });

		const planRun = runScenario(["exec", "plan-feedback", "--pr-number", String(prNumber), "--format", "json"], {
			cwd: REPO_ROOT,
			env,
			payloadClock: fixedClock("2026-06-09T08:30:02Z"),
			payloadStoreFactory: factory,
		});
		expect(await planRun.exit).toBe(0);
		const planEnvelope = JSON.parse(planRun.stdout.join("")) as {
			data: {
				resolved_inputs: { manifest: { descriptor: string; sequence: number }; classification: { descriptor: string; sequence: number } };
				plan_reference: { descriptor: string; sequence: number };
			};
		};
		expect(planEnvelope.data.resolved_inputs.manifest).toMatchObject({ descriptor: "pr-address-pr-42-manifest", sequence: 1 });
		expect(planEnvelope.data.resolved_inputs.classification).toMatchObject({ descriptor: "pr-address-pr-42-classification", sequence: 2 });
		expect(planEnvelope.data.plan_reference).toMatchObject({ descriptor: "pr-address-pr-42-plan", sequence: 3 });
	});

	test("validate-feedback-classification exposes only session input options at the command boundary", async () => {
		const helpRun = runScenario(["exec", "validate-feedback-classification", "--help"], { cwd: REPO_ROOT });
		expect(await helpRun.exit).toBe(0);
		const helpText = helpRun.stdout.join("");
		expect(helpText).toContain("--pr-number");
		expect(helpText).toContain("--classification-json");
		expect(helpText).toContain("--classification-file");
		expect(helpText).not.toContain("--payload-json");
		expect(helpText).not.toContain("--manifest-json");
		expect(helpText).not.toContain("--persist-session");

		const schemaRun = runScenario(["exec", "validate-feedback-classification", "--json-schema"], { cwd: REPO_ROOT });
		expect(await schemaRun.exit).toBe(0);
		const schemaDocument = JSON.parse(schemaRun.stdout.join("")) as { input_json_schema: { properties: Record<string, unknown> } };
		expect(schemaDocument.input_json_schema.properties).toHaveProperty("pr_number");
		expect(schemaDocument.input_json_schema.properties).toHaveProperty("classification_json");
		expect(schemaDocument.input_json_schema.properties).toHaveProperty("classification_file");
		expect(schemaDocument.input_json_schema.properties).toHaveProperty("harness_session_id");
		expect(schemaDocument.input_json_schema.properties).not.toHaveProperty("payload_json");
		expect(schemaDocument.input_json_schema.properties).not.toHaveProperty("manifest_json");
		expect(schemaDocument.input_json_schema.properties).not.toHaveProperty("persist_session");
	});

	for (const removedOptionArgs of [["--payload-json", "{}"], ["--manifest-json", "{}"], ["--persist-session"]]) {
		test(`validate-feedback-classification rejects removed option ${removedOptionArgs[0]}`, async () => {
			const run = runScenario(
				["exec", "validate-feedback-classification", "--pr-number", "42", ...removedOptionArgs, "--format", "json"],
				{ cwd: REPO_ROOT },
			);
			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toContain(`unknown option '${removedOptionArgs[0]}'`);
		});
	}

	test("plan-feedback session mode rejects mixed or missing sources and reports missing artifacts", async () => {
		const inputPath = join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");
		const root = join(await makeTempDir("pr-address-classification-"), "payload-root");
		const env = { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "session-plan" };

		const mixedRun = runScenario(["exec", "plan-feedback", "--pr-number", "42", "--payload-json", payload, "--format", "json"], { cwd: REPO_ROOT, env });
		expect(await mixedRun.exit).toBe(2);
		expect(JSON.parse(mixedRun.stdout.join("")).message).toContain("cannot mix session resolution");

		const missingSourceRun = runScenario(["exec", "plan-feedback", "--format", "json"], { cwd: REPO_ROOT, env });
		expect(await missingSourceRun.exit).toBe(2);
		expect(JSON.parse(missingSourceRun.stdout.join("")).message).toContain("requires a non-empty JSON payload");

		const missingArtifactRun = runScenario(["exec", "plan-feedback", "--pr-number", "42", "--format", "json"], { cwd: REPO_ROOT, env });
		expect(await missingArtifactRun.exit).toBe(2);
		const missingArtifactEnvelope = JSON.parse(missingArtifactRun.stdout.join(""));
		expect(missingArtifactEnvelope.error_type).toBe("payload_lookup_failed");
		expect(missingArtifactEnvelope.message).toContain("pr-address-pr-42-manifest");
	});
});

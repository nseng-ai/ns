import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { GOLDEN_V1_ROOT, REPO_ROOT, readJson } from "../support/golden.ts";
import { runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function asWrapperInput(value: unknown): { manifest: unknown; classification: unknown } {
	if (typeof value !== "object" || value === null || !("manifest" in value) || !("classification" in value)) {
		throw new TypeError("golden input must be a manifest/classification wrapper");
	}
	return value as { manifest: unknown; classification: unknown };
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

	test("managed operations serve JSON schema documents", async () => {
		for (const operation of ["classification-template", "validate-feedback-classification", "plan-feedback"]) {
			const run = runScenario(["exec", operation, "--json-schema"], { cwd: REPO_ROOT });
			expect(await run.exit).toBe(0);
			const schemaDocument = JSON.parse(run.stdout.join(""));
			expect(Object.keys(schemaDocument).sort()).toEqual(["input_json_schema", "output_json_schema"]);
			expect(run.stderr.join("")).toBe("");
		}
	});

	test("validate-feedback-classification and plan-feedback return managed JSON envelopes", async () => {
		const inputPath = join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");

		const validateRun = runScenario(["exec", "validate-feedback-classification", "--payload-json", payload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await validateRun.exit).toBe(0);
		expect(JSON.parse(validateRun.stdout.join("")).data.valid).toBe(true);

		const input = asWrapperInput(await readJson(inputPath));
		const tempDir = await makeTempDir("pr-address-classification-");
		const manifestPath = join(tempDir, "manifest.json");
		const classificationPath = join(tempDir, "classification.json");
		await writeFile(manifestPath, JSON.stringify(input.manifest), "utf8");
		await writeFile(classificationPath, JSON.stringify(input.classification), "utf8");
		const splitValidateRun = runScenario(
			[
				"exec",
				"validate-feedback-classification",
				"--manifest-file",
				manifestPath,
				"--classification-file",
				classificationPath,
				"--format",
				"json",
			],
			{ cwd: REPO_ROOT },
		);
		expect(await splitValidateRun.exit).toBe(0);
		expect(JSON.parse(splitValidateRun.stdout.join("")).data.valid).toBe(true);

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
});

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { buildPlanFeedbackSchemaDocument } from "../../src/classification-schemas.ts";
import { runCli, type CliDeps } from "../../src/cli.ts";
import { buildFeedbackClassificationTemplate, planFeedback, validateFeedbackClassification } from "../../src/classification-core.ts";
import { bodyLocatorSchema } from "../../src/feedback-manifest-contracts.ts";
import { feedbackPlanResultSchema } from "../../src/feedback-plan-contracts.ts";

const GOLDEN_ROOT = fileURLToPath(new URL("../fixtures/golden/v1", import.meta.url));
const tempDirs: string[] = [];

interface GoldenCase {
	name: string;
	inputPath: string;
	expectedPath: string;
}

const classificationTemplateCases = await goldenCases("classification-template");
const validationCases = await goldenCases("validate-feedback-classification");
const planningCases = await goldenCases("plan-feedback");

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function goldenCases(operation: string): Promise<GoldenCase[]> {
	const operationDir = join(GOLDEN_ROOT, operation);
	const entries = await readdir(operationDir, { withFileTypes: true });
	const cases = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			name: entry.name,
			inputPath: join(operationDir, entry.name, "input.json"),
			expectedPath: join(operationDir, entry.name, "expected.json"),
		}));
	cases.sort((left: GoldenCase, right: GoldenCase) => left.name.localeCompare(right.name));
	return cases;
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-classification-"));
	tempDirs.push(dir);
	return dir;
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8"));
}

function asWrapperInput(value: unknown): { manifest: unknown; classification: unknown } {
	if (typeof value !== "object" || value === null || !("manifest" in value) || !("classification" in value)) {
		throw new TypeError("golden input must be a manifest/classification wrapper");
	}
	return value as { manifest: unknown; classification: unknown };
}

function runManaged(args: readonly string[], deps: Pick<CliDeps, "stdin"> = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: {},
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: deps.stdin,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

describe("classification-template TypeScript parity", () => {
	for (const goldenCase of classificationTemplateCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);
			if (typeof input !== "object" || input === null || !("manifest" in input)) throw new TypeError("classification-template input must include manifest");

			const actual = buildFeedbackClassificationTemplate((input as { manifest: unknown }).manifest);

			expect(actual.type).toBe("ok");
			if (actual.type === "ok") expect(actual.value).toEqual(expected);
		});
	}
});

describe("validate-feedback-classification TypeScript parity", () => {
	for (const goldenCase of validationCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = asWrapperInput(await readJson(goldenCase.inputPath));
			const expected = await readJson(goldenCase.expectedPath);

			expect(validateFeedbackClassification(input)).toEqual(expected);
		});
	}
});

describe("plan-feedback TypeScript parity", () => {
	for (const goldenCase of planningCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = asWrapperInput(await readJson(goldenCase.inputPath));
			const expected = await readJson(goldenCase.expectedPath);

			expect(planFeedback(input)).toEqual(expected);
		});
	}
});

describe("canonical feedback contracts", () => {
	test("plan-feedback output parses the canonical result schema", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_ROOT, "plan-feedback/mixed-actionable-and-informational-counts/input.json")));
		const output = planFeedback(input);

		expect(() => feedbackPlanResultSchema.parse(output)).not.toThrow();
	});

	test("plan-feedback JSON schema exposes concrete item contracts", () => {
		const schemaText = JSON.stringify(buildPlanFeedbackSchemaDocument().output_json_schema);

		expect(schemaText).toContain("action_summary");
		expect(schemaText).toContain("covered_comment_ids");
		expect(schemaText).toContain("informational_reason");
		expect(schemaText).toContain("allowed_decisions");
	});

	test("body locator contract preserves null item pointers", () => {
		const locator = bodyLocatorSchema.parse({
			body_chars: 12,
			json_pointer: "/data/reviews/0/body",
			item_pointer: null,
			domain: { kind: "review", review_id: "R1" },
		});

		expect(locator.item_pointer).toBeNull();
	});
});

describe("managed classification/planning CLI operations", () => {
	test("classification-template accepts stdin, inline JSON, and file JSON natively", async () => {
		const input = await readJson(join(GOLDEN_ROOT, "classification-template/classification-template-rich-manifest/input.json"));
		if (typeof input !== "object" || input === null || !("manifest" in input)) throw new TypeError("classification-template input must include manifest");
		const manifest = JSON.stringify((input as { manifest: unknown }).manifest);

		const stdinRun = runManaged(["exec", "classification-template", "--format", "json"], { stdin: async () => manifest });
		expect(await stdinRun.exit).toBe(0);
		expect(JSON.parse(stdinRun.stdout.join("")).data.manifest_kind).toBe("prepare_run");

		const inlineRun = runManaged(["exec", "classification-template", "--manifest-json", manifest, "--format", "json"]);
		expect(await inlineRun.exit).toBe(0);
		expect(JSON.parse(inlineRun.stdout.join("")).data.counts.review_threads).toBe(1);

		const tempDir = await makeTempDir();
		const manifestPath = join(tempDir, "manifest.json");
		await writeFile(manifestPath, manifest, "utf8");
		const fileRun = runManaged(["exec", "classification-template", "--manifest-file", manifestPath, "--format", "json"]);
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.counts.resolved_review_threads_omitted).toBe(1);
	});

	test("managed operations serve JSON schema documents", async () => {
		for (const operation of ["classification-template", "validate-feedback-classification", "plan-feedback"]) {
			const run = runManaged(["exec", operation, "--json-schema"]);
			expect(await run.exit).toBe(0);
			const schemaDocument = JSON.parse(run.stdout.join(""));
			expect(Object.keys(schemaDocument).sort()).toEqual(["input_json_schema", "output_json_schema"]);
			expect(run.stderr.join("")).toBe("");
		}
	});

	test("validate-feedback-classification and plan-feedback return managed JSON envelopes", async () => {
		const inputPath = join(GOLDEN_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");

		const validateRun = runManaged(["exec", "validate-feedback-classification", "--payload-json", payload, "--format", "json"]);
		expect(await validateRun.exit).toBe(0);
		expect(JSON.parse(validateRun.stdout.join("")).data.valid).toBe(true);

		const input = asWrapperInput(await readJson(inputPath));
		const tempDir = await makeTempDir();
		const manifestPath = join(tempDir, "manifest.json");
		const classificationPath = join(tempDir, "classification.json");
		await writeFile(manifestPath, JSON.stringify(input.manifest), "utf8");
		await writeFile(classificationPath, JSON.stringify(input.classification), "utf8");
		const splitValidateRun = runManaged([
			"exec",
			"validate-feedback-classification",
			"--manifest-file",
			manifestPath,
			"--classification-file",
			classificationPath,
			"--format",
			"json",
		]);
		expect(await splitValidateRun.exit).toBe(0);
		expect(JSON.parse(splitValidateRun.stdout.join("")).data.valid).toBe(true);

		const planRun = runManaged(["exec", "plan-feedback", "--payload-json", payload, "--format", "json"]);
		expect(await planRun.exit).toBe(0);
		expect(JSON.parse(planRun.stdout.join("")).data.valid).toBe(true);
	});

	test("plan-feedback accepts --payload-file and rejects mixed payload sources", async () => {
		const inputPath = join(GOLDEN_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json");
		const payload = await readFile(inputPath, "utf8");
		const tempDir = await makeTempDir();
		const payloadPath = join(tempDir, "wrapper-payload.json");
		await writeFile(payloadPath, payload, "utf8");

		const fileRun = runManaged(["exec", "plan-feedback", "--payload-file", payloadPath, "--format", "json"]);
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.valid).toBe(true);

		const conflictRun = runManaged(["exec", "plan-feedback", "--payload-json", payload, "--payload-file", payloadPath, "--format", "json"]);
		expect(await conflictRun.exit).toBe(2);
		const conflictEnvelope = JSON.parse(conflictRun.stdout.join(""));
		expect(conflictEnvelope.error_type).toBe("invalid_request");
		expect(conflictEnvelope.message).toContain("--payload-file");
	});
});

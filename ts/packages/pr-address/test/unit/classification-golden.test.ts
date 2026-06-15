import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { buildPlanFeedbackSchemaDocument, classificationTemplateResultDocSchema } from "../../src/operation-schemas/classification.ts";
import { buildFeedbackClassificationTemplate, planFeedback, validateFeedbackClassification } from "../../src/classification.ts";
import { bodyLocatorSchema } from "../../src/feedback-manifest-contracts.ts";
import { feedbackPlanResultSchema } from "../../src/feedback-plan-contracts.ts";
import { asWrapperInput, GOLDEN_V1_ROOT, goldenCases, readJson } from "../support/golden.ts";

const classificationTemplateCases = await goldenCases("classification-template");
const validationCases = await goldenCases("validate-feedback-classification");
const planningCases = await goldenCases("plan-feedback");

describe("classification-template TypeScript parity", () => {
	for (const goldenCase of classificationTemplateCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);
			if (typeof input !== "object" || input === null || !("manifest" in input)) throw new TypeError("classification-template input must include manifest");

			const actual = buildFeedbackClassificationTemplate((input as { manifest: unknown }).manifest);

			expect(actual.type).toBe("ok");
			if (actual.type === "ok") {
				expect(actual.value).toEqual(expected);
				// Schema validation guard: ensure builder output always parses the doc schema
				expect(() => classificationTemplateResultDocSchema.parse(actual.value)).not.toThrow();
			}
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
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "plan-feedback/mixed-actionable-and-informational-counts/input.json")));
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

	test("voided_by_stack_work is rejected by default and accepted for stack planning", async () => {
		const input = asWrapperInput(await readJson(join(GOLDEN_V1_ROOT, "validate-feedback-classification/valid-all-source-kinds-mixed-dispositions/input.json")));
		const classification = structuredClone(input.classification) as {
			review_threads: Array<{ disposition: string; summary: string; action_summary: string; complexity?: string | null; informational_reason?: string | null; pre_existing?: boolean }>;
		};
		classification.review_threads[0] = {
			...classification.review_threads[0],
			disposition: "voided_by_stack_work",
			summary: "Thread was addressed by later stack work.",
			action_summary: "Already addressed by later stack work: the stack tip now shares the parser path.",
			complexity: null,
			informational_reason: null,
			pre_existing: false,
		};
		const stackInput = { manifest: input.manifest, classification };

		const defaultValidation = validateFeedbackClassification(stackInput);
		expect(defaultValidation.valid).toBe(false);
		expect(defaultValidation.errors).toContainEqual(
			expect.objectContaining({
				code: "invalid_voided_by_stack_work",
				message: "Review thread T1 uses disposition='voided_by_stack_work', which is only valid in stack-feedback planning.",
			}),
		);
		expect(planFeedback(stackInput).valid).toBe(false);

		const stackValidation = validateFeedbackClassification(stackInput, { allowVoidedByStackWork: true });
		expect(stackValidation.valid).toBe(true);
		const stackPlan = planFeedback(stackInput, { allowVoidedByStackWork: true });
		expect(stackPlan.valid).toBe(true);
		expect(stackPlan.voided_by_stack_work).toEqual([
			expect.objectContaining({
				source_kind: "review_thread",
				thread_id: "T1",
				action_summary: "Already addressed by later stack work: the stack tip now shares the parser path.",
				complexity: null,
			}),
		]);
		expect(stackPlan.batches.flatMap((batch) => batch.items).some((item) => item.thread_id === "T1")).toBe(false);
		expect(stackPlan.informational.some((item) => item.thread_id === "T1")).toBe(false);
	});
});

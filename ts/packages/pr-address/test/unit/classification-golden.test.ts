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
});

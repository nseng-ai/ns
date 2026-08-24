import { describe, expect, test } from "vitest";

import { GrillRoundController } from "../../src/grill/round-controller.ts";
import { executeGrillAskRound } from "../../src/grill/round-execution.ts";
import type {
	GrillDecisionRoundInput,
	GrillRoundCustomComponent,
	GrillRoundInput,
	GrillRoundToolContext,
} from "../../src/grill/round-protocol.ts";
import { validateGrillRoundInput } from "../../src/grill/round-protocol.ts";
import {
	runGrillRoundInlineUiWithRuntime,
	type GrillRoundInlineRuntime,
} from "../../src/grill/round-ui.ts";

function decisionRound(questionCount = 2): GrillDecisionRoundInput {
	return {
		mode: "decision-round",
		roundId: "round-1",
		questions: Array.from({ length: questionCount }, (_, index) => ({
			id: `q-${index + 1}`,
			question: `Question ${index + 1}?`,
			options: [
				{ value: "recommended", label: "Recommended" },
				{ value: "alternative", label: "Alternative" },
			],
			recommendedOptionValue: "recommended",
			recommendationRationale: "Best default.",
		})),
	};
}

function context(): GrillRoundToolContext {
	return {
		hasUI: true,
		ui: { custom: async () => new Promise<never>(() => undefined) },
	};
}

function answersFor(input: GrillDecisionRoundInput) {
	return input.questions.map((question) => ({
		questionId: question.id,
		kind: "option" as const,
		value: question.recommendedOptionValue,
		label: "Recommended",
		recommendation: "retained" as const,
	}));
}

function requireQuestion(input: GrillDecisionRoundInput, index: number) {
	const question = input.questions[index];
	if (question === undefined) throw new Error(`Missing test question at index ${index}`);
	return question;
}

function requireOption(input: GrillDecisionRoundInput, questionIndex: number, optionIndex: number) {
	const option = requireQuestion(input, questionIndex).options[optionIndex];
	if (option === undefined) throw new Error(`Missing test option at index ${optionIndex}`);
	return option;
}

describe("atomic grill round validation", () => {
	test("accepts stable IDs, 2–5 options, exact recommendation mappings, and oversized frontiers", () => {
		expect(validateGrillRoundInput(decisionRound(9))).toMatchObject({ ok: true, oversized: true });
		for (const count of [2, 3, 4, 5]) {
			const input = decisionRound(1);
			const question = requireQuestion(input, 0);
			question.options = Array.from({ length: count }, (_, index) => ({
				value: `option-${index}`,
				label: `Option ${index}`,
			}));
			question.recommendedOptionValue = "option-0";
			expect(validateGrillRoundInput(input).ok).toBe(true);
		}
	});

	test.each([1, 6])("rejects %i options and the whole round atomically", (count) => {
		const input = decisionRound();
		requireQuestion(input, 1).options = Array.from({ length: count }, (_, index) => ({
			value: `option-${index}`,
			label: `Option ${index}`,
		}));
		expect(validateGrillRoundInput(input)).toMatchObject({ ok: false });
	});

	test("rejects duplicate question/option IDs, malformed payloads, and missing recommendation maps", () => {
		const duplicateQuestions = decisionRound();
		requireQuestion(duplicateQuestions, 1).id = "q-1";
		expect(validateGrillRoundInput(duplicateQuestions)).toMatchObject({ ok: false });
		const duplicateOptions = decisionRound();
		requireOption(duplicateOptions, 0, 1).value = "recommended";
		expect(validateGrillRoundInput(duplicateOptions)).toMatchObject({ ok: false });
		const missingMapping = decisionRound();
		requireQuestion(missingMapping, 0).recommendedOptionValue = "missing";
		expect(validateGrillRoundInput(missingMapping)).toMatchObject({ ok: false });
		expect(validateGrillRoundInput({ mode: "decision-round", questions: "bad" })).toMatchObject({
			ok: false,
		});
	});
});

describe("GrillRoundController", () => {
	test("preselects recommendations, navigates backward/forward, preserves draft through status, and reviews", () => {
		const controller = new GrillRoundController(decisionRound());
		expect(controller.draftAnswers.map((answer) => answer.recommendation)).toEqual([
			"retained",
			"retained",
		]);
		controller.selectOption(1);
		controller.move(1);
		controller.openFreeform();
		expect(controller.submitFreeform("custom decision")).toBe(true);
		controller.showStatus();
		expect(controller.view).toBe("status");
		controller.returnToQuestion();
		controller.move(-1);
		expect(controller.currentAnswer).toMatchObject({
			value: "alternative",
			recommendation: "changed",
		});
		controller.showReview();
		expect(controller.submit()).toEqual({ action: "submitted", answers: controller.draftAnswers });
	});
});

describe("executeGrillAskRound", () => {
	test("submits the complete round from the immediate UI result", async () => {
		const input = decisionRound();
		const result = await executeGrillAskRound(input, context(), {
			uiRunner: async () => ({ action: "submitted", answers: answersFor(input) }),
		});
		expect(result.details).toEqual({
			action: "submitted",
			mode: "decision-round",
			roundId: "round-1",
			answers: answersFor(input),
		});
	});

	test.each([
		["cancelled", false],
		["ended", true],
	] as const)("%s discards drafts and differs by termination", async (action, terminate) => {
		const result = await executeGrillAskRound(decisionRound(), context(), {
			uiRunner: async () => ({ action }),
		});
		expect(result.details).toMatchObject({ action });
		expect(result.terminate === true).toBe(terminate);
	});

	test("fails closed when the UI is unavailable", async () => {
		const result = await executeGrillAskRound(decisionRound(), { hasUI: false, ui: {} });
		expect(result.details).toMatchObject({ action: "ui-failed" });
	});

	test("confirmation mode trusts the immediate return or accept result", async () => {
		const input: GrillRoundInput = { mode: "confirmation", summary: "Resolved design" };
		const confirmed = await executeGrillAskRound(input, context(), {
			uiRunner: async () => ({ action: "confirmed" }),
		});
		const returned = await executeGrillAskRound(input, context(), {
			uiRunner: async () => ({ action: "return-to-grilling" }),
		});
		expect(confirmed.details).toEqual({ action: "confirmed", mode: "confirmation" });
		expect(returned.details).toEqual({ action: "return-to-grilling", mode: "confirmation" });
	});
});

describe("round-owning custom UI", () => {
	test("one custom call owns status return, review, and atomic completion with oversized warning", async () => {
		const input = decisionRound(9);
		let customCalls = 0;
		let component: GrillRoundCustomComponent;
		const runtime: GrillRoundInlineRuntime = {
			Editor: class {
				onSubmit?: (value: string) => void;
				setText(): void {}
				render(): string[] {
					return ["editor"];
				}
				handleInput(): void {}
			},
			matchesKey: (data, key) => data === key,
			truncateToWidth: (value) => value,
		};
		const outcome = runGrillRoundInlineUiWithRuntime(
			input,
			{
				hasUI: true,
				ui: {
					custom: async <T>(
						factory: (
							tui: unknown,
							theme: unknown,
							keybindings: unknown,
							done: (value: T) => void,
						) => GrillRoundCustomComponent,
					) => {
						customCalls += 1;
						return new Promise<T>((resolve) => {
							component = factory({ requestRender() {} }, {}, {}, resolve);
							expect(component.render(120).join("\n")).toContain("large frontier");
							component.handleInput?.("s");
							expect(component.render(120).join("\n")).toContain("Return to the same draft");
							component.handleInput?.("b");
							component.handleInput?.("v");
							expect(component.render(120).join("\n")).toContain("Final review");
							component.handleInput?.("enter");
						});
					},
				},
			},
			runtime,
		);
		await expect(outcome).resolves.toMatchObject({ action: "submitted" });
		expect(customCalls).toBe(1);
	});
});

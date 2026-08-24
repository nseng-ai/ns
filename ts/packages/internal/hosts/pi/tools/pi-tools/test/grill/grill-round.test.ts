import {
	formatGrillKickoffMarker,
	GRILL_ASK_ROUND_TOOL_NAME,
} from "@nseng-ai/pi-runtime/grill/surfaces";
import { describe, expect, test } from "vitest";

import { GrillRoundController } from "../../src/grill/round-controller.ts";
import { executeGrillAskRound } from "../../src/grill/round-execution.ts";
import type {
	GrillDecisionRoundInput,
	GrillRoundCustomComponent,
	GrillRoundDetails,
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

function kickoff(savedPlan = false): unknown {
	return {
		type: "message",
		message: {
			role: "user",
			content: formatGrillKickoffMarker({
				version: 1,
				attemptId: "attempt",
				policy: savedPlan ? { kind: "saved-plan", maxDecisionRounds: 5 } : { kind: "general" },
			}),
		},
	};
}

function historyResult(details: GrillRoundDetails): unknown {
	return {
		type: "message",
		message: { role: "toolResult", toolName: GRILL_ASK_ROUND_TOOL_NAME, details },
	};
}

function context(entries: readonly unknown[] = [kickoff()]): GrillRoundToolContext {
	return {
		hasUI: true,
		ui: { custom: async () => new Promise<never>(() => undefined) },
		sessionManager: { getBranch: () => entries },
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

describe("atomic grill round validation", () => {
	test("accepts stable IDs, 2–5 options, exact recommendation mappings, and oversized frontiers", () => {
		expect(validateGrillRoundInput(decisionRound(9))).toMatchObject({ ok: true, oversized: true });
		for (const count of [2, 3, 4, 5]) {
			const input = decisionRound(1);
			input.questions[0]!.options = Array.from({ length: count }, (_, index) => ({
				value: `option-${index}`,
				label: `Option ${index}`,
			}));
			input.questions[0]!.recommendedOptionValue = "option-0";
			expect(validateGrillRoundInput(input).ok).toBe(true);
		}
	});

	test.each([1, 6])("rejects %i options and the whole round atomically", (count) => {
		const input = decisionRound();
		input.questions[1]!.options = Array.from({ length: count }, (_, index) => ({
			value: `option-${index}`,
			label: `Option ${index}`,
		}));
		expect(validateGrillRoundInput(input)).toMatchObject({ ok: false });
	});

	test("rejects duplicate question/option IDs, malformed payloads, and missing recommendation maps", () => {
		const duplicateQuestions = decisionRound();
		duplicateQuestions.questions[1]!.id = "q-1";
		expect(validateGrillRoundInput(duplicateQuestions)).toMatchObject({ ok: false });
		const duplicateOptions = decisionRound();
		duplicateOptions.questions[0]!.options[1]!.value = "recommended";
		expect(validateGrillRoundInput(duplicateOptions)).toMatchObject({ ok: false });
		const missingMapping = decisionRound();
		missingMapping.questions[0]!.recommendedOptionValue = "missing";
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
	test("submits ordered aggregate evidence with history-derived counts", async () => {
		const input = decisionRound();
		const prior = {
			action: "submitted" as const,
			mode: "decision-round" as const,
			roundId: "round-0",
			answers: [
				{
					questionId: "q-0",
					kind: "option" as const,
					value: "yes",
					label: "Yes",
					recommendation: "retained" as const,
				},
			],
			submittedRoundCount: 1,
			answeredDecisionCount: 1,
		};
		input.roundId = "round-2";
		input.questions[0]!.id = "q-2";
		input.questions[1]!.id = "q-3";
		const result = await executeGrillAskRound(input, context([kickoff(), historyResult(prior)]), {
			uiRunner: async () => ({ action: "submitted", answers: answersFor(input) }),
		});
		expect(result.details).toEqual({
			action: "submitted",
			mode: "decision-round",
			roundId: "round-2",
			answers: answersFor(input),
			submittedRoundCount: 2,
			answeredDecisionCount: 3,
		});
	});

	test.each([
		[
			"missing answer",
			[
				{
					questionId: "q-1",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
			],
		],
		[
			"reordered answers",
			[
				{
					questionId: "q-2",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
				{
					questionId: "q-1",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
			],
		],
		[
			"unknown question",
			[
				{
					questionId: "unknown",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
				{
					questionId: "q-2",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
			],
		],
		[
			"unknown option",
			[
				{
					questionId: "q-1",
					kind: "option",
					value: "unknown",
					label: "Unknown",
					recommendation: "changed",
				},
				{
					questionId: "q-2",
					kind: "option",
					value: "recommended",
					label: "Recommended",
					recommendation: "retained",
				},
			],
		],
	] as const)("rejects a submitted UI outcome with %s", async (_label, answers) => {
		const result = await executeGrillAskRound(decisionRound(), context(), {
			uiRunner: async () => ({ action: "submitted", answers }),
		});
		expect(result.details).toMatchObject({ action: "ui-failed" });
	});

	test("reports abort as cancellation without opening the UI", async () => {
		const controller = new AbortController();
		controller.abort();
		let called = false;
		const result = await executeGrillAskRound(decisionRound(), context(), {
			signal: controller.signal,
			uiRunner: async () => {
				called = true;
				return undefined;
			},
		});
		expect(called).toBe(false);
		expect(result.details).toMatchObject({ action: "cancelled" });
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

	test("fails closed when UI or kickoff evidence is unavailable", async () => {
		const noUi = await executeGrillAskRound(decisionRound(), {
			hasUI: false,
			ui: {},
			sessionManager: { getBranch: () => [kickoff()] },
		});
		expect(noUi.details).toMatchObject({ action: "ui-failed" });
		const noHistory = await executeGrillAskRound(decisionRound(), context([]), {
			uiRunner: async () => ({ action: "submitted", answers: [] }),
		});
		expect(noHistory.details).toMatchObject({ action: "ui-failed" });
	});

	test("confirmation mode explicitly supports only return and accept", async () => {
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

	test("cancel blocks immediate confirmation but general grilling may resume", async () => {
		const confirmationInput: GrillRoundInput = {
			mode: "confirmation",
			summary: "Resolved design",
		};
		const cancelled = historyResult({
			action: "cancelled",
			mode: "decision-round",
			roundId: "round-1",
		});
		const cancelledContext = context([kickoff(), cancelled]);
		const confirmation = await executeGrillAskRound(confirmationInput, cancelledContext, {
			uiRunner: async () => ({ action: "confirmed" }),
		});
		const resumedRound = decisionRound();
		resumedRound.roundId = "round-2";
		const resumed = await executeGrillAskRound(resumedRound, cancelledContext, {
			uiRunner: async () => ({ action: "submitted", answers: answersFor(resumedRound) }),
		});
		expect(confirmation.details).toEqual({ action: "ui-failed", mode: "confirmation" });
		expect(resumed.details).toMatchObject({ action: "submitted", roundId: "round-2" });
	});

	test("Saved Plan cancellation rejects later decision rounds", async () => {
		const cancelled = historyResult({
			action: "cancelled",
			mode: "decision-round",
			roundId: "round-1",
		});
		const resumedRound = decisionRound();
		resumedRound.roundId = "round-2";
		const resumed = await executeGrillAskRound(resumedRound, context([kickoff(true), cancelled]), {
			uiRunner: async () => ({ action: "submitted", answers: answersFor(resumedRound) }),
		});
		expect(resumed.details).toEqual({
			action: "ui-failed",
			mode: "decision-round",
			roundId: "round-2",
		});
	});

	test("a sixth Saved Plan decision call produces terminal cap-exhausted evidence", async () => {
		const entries: unknown[] = [kickoff(true)];
		for (let index = 1; index <= 5; index += 1) {
			entries.push(
				historyResult({
					action: "submitted",
					mode: "decision-round",
					roundId: `round-${index}`,
					answers: [
						{
							questionId: `old-q-${index}`,
							kind: "option",
							value: "yes",
							label: "Yes",
							recommendation: "retained",
						},
					],
					submittedRoundCount: index,
					answeredDecisionCount: index,
				}),
			);
		}
		const input = decisionRound(1);
		input.roundId = "round-6";
		const result = await executeGrillAskRound(input, context(entries), {
			uiRunner: async () => ({ action: "submitted", answers: answersFor(input) }),
		});
		expect(result.details).toEqual({
			action: "cap-exhausted",
			mode: "decision-round",
			roundId: "round-6",
		});
		expect(result.terminate).toBe(true);
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

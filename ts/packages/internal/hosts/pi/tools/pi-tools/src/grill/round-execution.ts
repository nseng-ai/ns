import type {
	GrillConfirmationUiOutcome,
	GrillDecisionRoundInput,
	GrillDecisionRoundUiOutcome,
	GrillRoundAnswer,
	GrillRoundDetails,
	GrillRoundExecutionOptions,
	GrillRoundInput,
	GrillRoundToolContext,
	GrillRoundToolResult,
} from "./round-protocol.ts";
import { validateGrillRoundInput } from "./round-protocol.ts";
import { runGrillRoundInlineUi } from "./round-ui.ts";

export async function executeGrillAskRound(
	params: unknown,
	ctx: GrillRoundToolContext,
	options: GrillRoundExecutionOptions = {},
): Promise<GrillRoundToolResult> {
	const validation = validateGrillRoundInput(params);
	if (!validation.ok) {
		return result(`Invalid grill_ask_round input:\n${validation.errors.join("\n")}`, {
			action: "invalid-tool-input",
			errors: [...validation.errors],
		});
	}
	const input = validation.input;

	if (!ctx.hasUI || ctx.ui.custom === undefined) {
		return input.mode === "decision-round"
			? uiFailure(input, "Atomic grill round UI is unavailable; no draft was submitted.")
			: result("Confirmation UI is unavailable; shared understanding was not confirmed.", {
					action: "ui-failed",
					mode: "confirmation",
				});
	}

	try {
		if (input.mode === "decision-round") {
			const runner = options.decisionUiRunner ?? runGrillRoundInlineUi;
			const outcome = await runner(input, ctx);
			if (outcome === undefined) {
				return uiFailure(
					input,
					"Atomic grill round UI closed without a result; no draft was submitted.",
				);
			}
			return decisionOutcomeResult(input, outcome);
		}

		const runner = options.confirmationUiRunner ?? runGrillRoundInlineUi;
		const outcome = await runner(input, ctx);
		if (outcome === undefined) {
			return result("Confirmation UI closed without a result.", {
				action: "ui-failed",
				mode: "confirmation",
			});
		}
		return confirmationOutcomeResult(outcome);
	} catch {
		return input.mode === "decision-round"
			? uiFailure(input, "Atomic grill round UI failed; no draft was submitted.")
			: result("Confirmation UI failed; shared understanding was not confirmed.", {
					action: "ui-failed",
					mode: "confirmation",
				});
	}
}

function confirmationOutcomeResult(outcome: GrillConfirmationUiOutcome): GrillRoundToolResult {
	switch (outcome.action) {
		case "confirmed":
			return result("Shared understanding confirmed.", {
				action: "confirmed",
				mode: "confirmation",
			});
		case "return-to-grilling":
			return result("Return to grilling and recompute the complete frontier.", {
				action: "return-to-grilling",
				mode: "confirmation",
			});
	}
}

function decisionOutcomeResult(
	input: GrillDecisionRoundInput,
	outcome: GrillDecisionRoundUiOutcome,
): GrillRoundToolResult {
	switch (outcome.action) {
		case "submitted":
			return result(formatSubmittedAnswers(outcome.answers), {
				action: "submitted",
				mode: "decision-round",
				roundId: input.roundId,
				answers: [...outcome.answers],
			});
		case "cancelled":
			return result("Decision round cancelled; all drafts were discarded.", {
				action: "cancelled",
				mode: "decision-round",
				roundId: input.roundId,
			});
		case "ended":
			return result(
				"Grilling ended; all drafts in this round were discarded.",
				{
					action: "ended",
					mode: "decision-round",
					roundId: input.roundId,
				},
				true,
			);
	}
}

function formatSubmittedAnswers(answers: readonly GrillRoundAnswer[]): string {
	return [
		`Submitted ${answers.length} decisions atomically:`,
		...answers.map((answer, index) => {
			const answerText =
				answer.kind === "option" ? `${answer.label} (${answer.value})` : answer.value;
			return `${index + 1}. ${answer.questionId}: ${answerText} [${answer.recommendation}]`;
		}),
	].join("\n");
}

function uiFailure(
	input: Extract<GrillRoundInput, { mode: "decision-round" }>,
	message: string,
): GrillRoundToolResult {
	return result(message, {
		action: "ui-failed",
		mode: "decision-round",
		roundId: input.roundId,
	});
}

function result(text: string, details: GrillRoundDetails, terminate = false): GrillRoundToolResult {
	return {
		content: [{ type: "text", text }],
		details,
		...(terminate ? { terminate: true } : {}),
	};
}

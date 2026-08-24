import { evaluateGrillAttempt } from "@nseng-ai/pi-runtime/grill/surfaces";

import type {
	GrillRoundAnswer,
	GrillRoundDetails,
	GrillRoundExecutionOptions,
	GrillRoundInput,
	GrillRoundToolContext,
	GrillRoundToolResult,
	GrillRoundUiOutcome,
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
			errors: validation.errors,
		});
	}
	const input = validation.input;
	if (isAborted(options.signal)) return cancelledBySignal(input);
	const history = readHistory(ctx);
	const evaluation = evaluateGrillAttempt(history);
	if (input.mode === "confirmation") {
		if (evaluation.kickoff === undefined) {
			return result("No valid grill kickoff evidence; shared understanding was not confirmed.", {
				action: "ui-failed",
				mode: "confirmation",
			});
		}
		if (evaluation.status !== "active") {
			return result(
				`Grill attempt is not active (${evaluation.status}); shared understanding was not confirmed.`,
				{ action: "ui-failed", mode: "confirmation" },
			);
		}
	}
	if (input.mode === "decision-round") {
		if (evaluation.kickoff === undefined)
			return uiFailure(input, "No valid grill kickoff evidence.");
		const mayResumeCancelledGeneralAttempt =
			evaluation.status === "cancelled" && evaluation.kickoff.policy.kind === "general";
		if (evaluation.status !== "active" && !mayResumeCancelledGeneralAttempt) {
			return terminalForUnavailableAttempt(input, evaluation.status);
		}
		if (evaluation.submittedRoundIds.has(input.roundId)) {
			return invalidIds(`roundId ${input.roundId} was already submitted.`);
		}
		const duplicateQuestion = input.questions.find((question) =>
			evaluation.submittedQuestionIds.has(question.id),
		);
		if (duplicateQuestion !== undefined) {
			return invalidIds(`question id ${duplicateQuestion.id} was already submitted.`);
		}
		if (
			evaluation.kickoff.policy.kind === "saved-plan" &&
			evaluation.submittedRoundCount >= evaluation.kickoff.policy.maxDecisionRounds
		) {
			return result(
				"Saved Plan decision-round cap exhausted; drafts were discarded.",
				{
					action: "cap-exhausted",
					mode: "decision-round",
					roundId: input.roundId,
				},
				true,
			);
		}
	}

	if (!ctx.hasUI || ctx.ui.custom === undefined) {
		return input.mode === "decision-round"
			? uiFailure(input, "Atomic grill round UI is unavailable; no draft was submitted.")
			: result("Confirmation UI is unavailable; shared understanding was not confirmed.", {
					action: "ui-failed",
					mode: "confirmation",
				});
	}

	const runner = options.uiRunner ?? runGrillRoundInlineUi;
	try {
		const outcome = await runner(input, ctx, options.signal);
		if (isAborted(options.signal)) return cancelledBySignal(input);
		if (outcome === undefined) {
			return input.mode === "decision-round"
				? uiFailure(input, "Atomic grill round UI closed without a result; no draft was submitted.")
				: result("Confirmation UI closed without a result.", {
						action: "ui-failed",
						mode: "confirmation",
					});
		}
		return outcomeResult(
			input,
			outcome,
			evaluation.submittedRoundCount,
			evaluation.answeredDecisionCount,
		);
	} catch {
		return input.mode === "decision-round"
			? uiFailure(input, "Atomic grill round UI failed; no draft was submitted.")
			: result("Confirmation UI failed; shared understanding was not confirmed.", {
					action: "ui-failed",
					mode: "confirmation",
				});
	}
}

function outcomeResult(
	input: GrillRoundInput,
	outcome: GrillRoundUiOutcome,
	submittedRoundCount: number,
	answeredDecisionCount: number,
): GrillRoundToolResult {
	if (input.mode === "confirmation") {
		if (outcome.action === "confirmed") {
			return result("Shared understanding confirmed.", {
				action: "confirmed",
				mode: "confirmation",
			});
		}
		if (outcome.action === "return-to-grilling") {
			return result("Return to grilling and recompute the complete frontier.", {
				action: "return-to-grilling",
				mode: "confirmation",
			});
		}
		return result("Return to grilling and recompute the complete frontier.", {
			action: "return-to-grilling",
			mode: "confirmation",
		});
	}

	switch (outcome.action) {
		case "submitted": {
			const errors = validateSubmittedAnswers(input, outcome.answers);
			if (errors.length > 0) {
				return uiFailure(
					input,
					`Atomic grill round UI returned invalid answers: ${errors.join(" ")}`,
				);
			}
			return result(`Submitted ${outcome.answers.length} decisions atomically.`, {
				action: "submitted",
				mode: "decision-round",
				roundId: input.roundId,
				answers: outcome.answers,
				submittedRoundCount: submittedRoundCount + 1,
				answeredDecisionCount: answeredDecisionCount + outcome.answers.length,
			});
		}
		case "cancelled":
			return result("Decision round paused; all drafts were discarded.", {
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
		case "confirmed":
		case "return-to-grilling":
			return invalidIds(`Outcome ${outcome.action} is not valid for decision-round mode.`);
	}
}

function validateSubmittedAnswers(
	input: Extract<GrillRoundInput, { mode: "decision-round" }>,
	answers: readonly GrillRoundAnswer[],
): string[] {
	if (answers.length !== input.questions.length) {
		return [`Expected ${input.questions.length} answers, received ${answers.length}.`];
	}
	const errors: string[] = [];
	for (const [index, question] of input.questions.entries()) {
		const answer = answers[index];
		if (answer === undefined || answer.questionId !== question.id) {
			errors.push(`Answer ${index + 1} must match question ${question.id}.`);
			continue;
		}
		if (answer.kind === "option") {
			const option = question.options.find((candidate) => candidate.value === answer.value);
			if (option === undefined || option.label !== answer.label) {
				errors.push(`Answer for ${question.id} must reference one listed option.`);
				continue;
			}
			const expectedRecommendation =
				option.value === question.recommendedOptionValue ? "retained" : "changed";
			if (answer.recommendation !== expectedRecommendation) {
				errors.push(`Answer for ${question.id} has inconsistent recommendation evidence.`);
			}
		}
	}
	return errors;
}

function isAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

function cancelledBySignal(input: GrillRoundInput): GrillRoundToolResult {
	return input.mode === "decision-round"
		? result("Decision round cancelled; all drafts were discarded.", {
				action: "cancelled",
				mode: "decision-round",
				roundId: input.roundId,
			})
		: result("Confirmation cancelled; shared understanding was not confirmed.", {
				action: "ui-failed",
				mode: "confirmation",
			});
}

function terminalForUnavailableAttempt(
	input: Extract<GrillRoundInput, { mode: "decision-round" }>,
	status: ReturnType<typeof evaluateGrillAttempt>["status"],
): GrillRoundToolResult {
	if (status === "cap-exhausted") {
		return result(
			"Grill attempt is already cap-exhausted.",
			{
				action: "cap-exhausted",
				mode: "decision-round",
				roundId: input.roundId,
			},
			true,
		);
	}
	return uiFailure(input, `Grill attempt is not active (${status}); no draft was submitted.`);
}

function invalidIds(message: string): GrillRoundToolResult {
	return result(`Invalid grill_ask_round input:\n${message}`, {
		action: "invalid-tool-input",
		errors: [message],
	});
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

function readHistory(ctx: GrillRoundToolContext): readonly unknown[] {
	if (ctx.sessionManager === undefined) return [];
	try {
		const branch = ctx.sessionManager.getBranch();
		return Array.isArray(branch) ? branch : [];
	} catch {
		return [];
	}
}

function result(text: string, details: GrillRoundDetails, terminate = false): GrillRoundToolResult {
	return {
		content: [{ type: "text", text }],
		details,
		...(terminate ? { terminate: true } : {}),
	};
}

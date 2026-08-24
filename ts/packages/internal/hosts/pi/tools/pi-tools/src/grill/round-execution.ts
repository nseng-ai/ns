import type {
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

	const runner = options.uiRunner ?? runGrillRoundInlineUi;
	try {
		const outcome = await runner(input, ctx);
		if (outcome === undefined) {
			return input.mode === "decision-round"
				? uiFailure(input, "Atomic grill round UI closed without a result; no draft was submitted.")
				: result("Confirmation UI closed without a result.", {
						action: "ui-failed",
						mode: "confirmation",
					});
		}
		// This primitive trusts the immediate result from its owned Pi UI. If a future
		// consumer must authorize work after a resume, fork, or separate tool call,
		// add durable attempt identity and validated result evidence at that boundary.
		return outcomeResult(input, outcome);
	} catch {
		return input.mode === "decision-round"
			? uiFailure(input, "Atomic grill round UI failed; no draft was submitted.")
			: result("Confirmation UI failed; shared understanding was not confirmed.", {
					action: "ui-failed",
					mode: "confirmation",
				});
	}
}

function outcomeResult(input: GrillRoundInput, outcome: GrillRoundUiOutcome): GrillRoundToolResult {
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
		case "submitted":
			return result(`Submitted ${outcome.answers.length} decisions atomically.`, {
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
		case "confirmed":
		case "return-to-grilling":
			return invalidIds(`Outcome ${outcome.action} is not valid for decision-round mode.`);
	}
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

function result(text: string, details: GrillRoundDetails, terminate = false): GrillRoundToolResult {
	return {
		content: [{ type: "text", text }],
		details,
		...(terminate ? { terminate: true } : {}),
	};
}

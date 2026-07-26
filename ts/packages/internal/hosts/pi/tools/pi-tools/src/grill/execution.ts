import type { GrillAskOutcome } from "./controller.ts";
import { runGrillAskInlineUi } from "./inline-ui.ts";
import { buildGrillAskSelectTitle } from "./prompts.ts";
import { readGrillAskProgress } from "./progress.ts";
import type {
	GrillAskExecutionOptions,
	GrillAskToolContext,
	NormalizedGrillAskInput,
	ToolResult,
} from "./protocol.ts";
import {
	cancelledResult,
	endGrillResult,
	freeformAnswerResult,
	invalidToolInputResult,
	selectedChoiceResult,
	statusRequestResult,
	textResult,
	type GrillAskDetails,
} from "./result.ts";
import { validateGrillAskInput } from "./validate.ts";
import { buildGrillAskRows, rowSelectDisplay } from "./view.ts";

const UNKNOWN_SELECTION_MESSAGE =
	"The structured grill question returned an unknown selection. Do not treat this as an answer; summarize what is known or ask whether to continue.";
const BLANK_FREEFORM_MESSAGE =
	"User cancelled the freeform answer or left it blank. Do not treat this as an answer; summarize what is known or ask whether to continue.";

export async function executeGrillAsk(
	params: unknown,
	ctx: GrillAskToolContext,
	executionOptions: GrillAskExecutionOptions = {},
): Promise<ToolResult<GrillAskDetails>> {
	const validation = validateGrillAskInput(params);
	if (!validation.ok) {
		return invalidToolInputResult(validation.errors);
	}

	const input = validation.input;
	if (executionOptions.signal?.aborted) {
		return cancelledResult(input.question);
	}

	if (ctx.hasUI && ctx.ui.custom !== undefined) {
		const uiRunner = executionOptions.uiRunner ?? runGrillAskInlineUi;
		try {
			const outcome = await uiRunner(input, ctx);
			if (outcome === undefined) {
				return cancelledResult(input.question);
			}
			return grillAskOutcomeResult(input, outcome, ctx);
		} catch {
			if (executionOptions.signal?.aborted) {
				return cancelledResult(input.question);
			}
			// Custom UI support can be absent or drift across Pi runtimes. Fall back to the stable legacy dialogs.
		}
	}

	return executeLegacyGrillAsk(input, ctx);
}

async function executeLegacyGrillAsk(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
): Promise<ToolResult<GrillAskDetails>> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		return textResult(
			"Structured grill question UI is unavailable. Ask the same one question normally with numbered choices, including the explicit choices, Other/freeform when allowed, Show current grill status, and End grilling session when allowed.",
			{ action: "ui-unavailable", question: input.question },
		);
	}

	const rows = buildGrillAskRows(input);
	const displays = rows.map(rowSelectDisplay);
	const progress = readGrillAskProgress(ctx);
	const selectedDisplay = await ctx.ui.select(buildGrillAskSelectTitle(input, progress), displays);
	if (selectedDisplay === undefined) {
		return cancelledResult(input.question);
	}

	const selectedIndex = displays.indexOf(selectedDisplay);
	const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
	if (selectedRow === undefined) {
		return cancelledResult(input.question, UNKNOWN_SELECTION_MESSAGE);
	}

	switch (selectedRow.kind) {
		case "choice":
			return selectedChoiceResult(input.question, selectedRow);
		case "freeform":
			return executeLegacyFreeformAnswer(input, ctx);
		case "status":
			return statusRequestResult(input.question, progress, input.estimatedRemaining);
		case "end-grill":
			return endGrillResult(input.question);
		default: {
			const exhaustive: never = selectedRow;
			return exhaustive;
		}
	}
}

async function executeLegacyFreeformAnswer(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
): Promise<ToolResult<GrillAskDetails>> {
	if (ctx.ui.editor === undefined) {
		return textResult(
			"Structured grill freeform editor is unavailable. Ask the same one question normally with numbered choices, an Other/freeform option, Show current grill status, and End grilling session when allowed.",
			{ action: "ui-unavailable", question: input.question },
		);
	}
	const answer = await ctx.ui.editor("Freeform answer", "");
	if (answer === undefined || answer.trim().length === 0) {
		return cancelledResult(input.question, BLANK_FREEFORM_MESSAGE);
	}
	return freeformAnswerResult(input.question, answer);
}

function grillAskOutcomeResult(
	input: NormalizedGrillAskInput,
	outcome: GrillAskOutcome,
	ctx: GrillAskToolContext,
): ToolResult<GrillAskDetails> {
	switch (outcome.action) {
		case "choice":
			return selectedChoiceResult(input.question, outcome.entry);
		case "freeform":
			return freeformAnswerResult(input.question, outcome.answer);
		case "status-request":
			return statusRequestResult(
				input.question,
				readGrillAskProgress(ctx),
				input.estimatedRemaining,
			);
		case "end-grill":
			return endGrillResult(input.question);
		case "cancelled":
			return cancelledResult(input.question);
		default: {
			const exhaustive: never = outcome;
			return exhaustive;
		}
	}
}

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
import { resolveFreeformSideQuest, resolveSideQuest } from "./sidequest/sentinel.ts";
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
			const outcome = await uiRunner(input, ctx, {
				canStartSideQuest: executionOptions.onSideQuestStarted !== undefined,
			});
			if (outcome === undefined) {
				return cancelledResult(input.question);
			}
			return grillAskOutcomeResult(input, outcome, ctx, executionOptions);
		} catch {
			if (executionOptions.signal?.aborted) {
				return cancelledResult(input.question);
			}
			// Custom UI support can be absent or drift across Pi runtimes. Fall back to the stable legacy dialogs.
		}
	}

	return executeLegacyGrillAsk(input, ctx, executionOptions);
}

async function executeLegacyGrillAsk(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
	executionOptions: GrillAskExecutionOptions,
): Promise<ToolResult<GrillAskDetails>> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		return textResult(
			"Structured grill question UI is unavailable. Ask the same one question normally with numbered choices, including the explicit choices, Other/freeform when allowed, Show current grill status, and End grilling session when allowed.",
			{ action: "ui-unavailable", question: input.question },
		);
	}

	const rows = buildGrillAskRows(input, {
		canStartSideQuest: executionOptions.onSideQuestStarted !== undefined,
	});
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
			return executeLegacyFreeformAnswer(input, ctx, executionOptions);
		case "side-quest":
			return executeLegacySideQuest(input, ctx, executionOptions);
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

async function executeLegacySideQuest(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
	executionOptions: GrillAskExecutionOptions,
): Promise<ToolResult<GrillAskDetails>> {
	if (ctx.ui.editor === undefined) {
		return textResult(
			"Structured grill side-quest editor is unavailable. Ask the user for the side-quest topic without treating it as an answer to the pending grill question.",
			{ action: "ui-unavailable", question: input.question },
		);
	}
	const topic = await ctx.ui.editor("Side quest topic", "");
	if (topic === undefined || topic.trim().length === 0) {
		return cancelledResult(input.question, BLANK_FREEFORM_MESSAGE);
	}
	return sideQuestResult({ input, ctx, executionOptions, text: topic });
}

async function executeLegacyFreeformAnswer(
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
	executionOptions: GrillAskExecutionOptions,
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
	return freeformOrSideQuestResult({ input, ctx, executionOptions, text: answer });
}

interface SideQuestResultOptions {
	input: NormalizedGrillAskInput;
	ctx: GrillAskToolContext;
	executionOptions: GrillAskExecutionOptions;
	text: string;
}

interface SideQuestResolutionContext {
	question: string;
	ctx: GrillAskToolContext;
	toolCallId?: string;
	onSideQuestStarted?: NonNullable<GrillAskExecutionOptions["onSideQuestStarted"]>;
}

function buildSideQuestResolutionContext(
	options: SideQuestResultOptions,
): SideQuestResolutionContext {
	return {
		question: options.input.question,
		ctx: options.ctx,
		...(options.executionOptions.toolCallId === undefined
			? {}
			: { toolCallId: options.executionOptions.toolCallId }),
		...(options.executionOptions.onSideQuestStarted === undefined
			? {}
			: { onSideQuestStarted: options.executionOptions.onSideQuestStarted }),
	};
}

function sideQuestResult(options: SideQuestResultOptions): ToolResult<GrillAskDetails> {
	return resolveSideQuest({
		topic: options.text,
		...buildSideQuestResolutionContext(options),
	});
}

function freeformOrSideQuestResult(options: SideQuestResultOptions): ToolResult<GrillAskDetails> {
	const sideQuest = resolveFreeformSideQuest({
		answer: options.text,
		...buildSideQuestResolutionContext(options),
	});
	return sideQuest ?? freeformAnswerResult(options.input.question, options.text);
}

function grillAskOutcomeResult(
	input: NormalizedGrillAskInput,
	outcome: GrillAskOutcome,
	ctx: GrillAskToolContext,
	executionOptions: GrillAskExecutionOptions,
): ToolResult<GrillAskDetails> {
	switch (outcome.action) {
		case "choice":
			return selectedChoiceResult(input.question, outcome.entry);
		case "freeform":
			return freeformOrSideQuestResult({
				input,
				ctx,
				executionOptions,
				text: outcome.answer,
			});
		case "side-quest":
			return sideQuestResult({ input, ctx, executionOptions, text: outcome.topic });
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

import type { GrillAskOutcome } from "./grill-ui/controller.ts";
import { runGrillAskInlineUi } from "./grill-ui/inline-ui.ts";
import {
	cancelledResult,
	endGrillResult,
	freeformAnswerResult,
	invalidToolInputResult,
	selectedChoiceResult,
	textResult,
	type GrillAskDetails,
} from "./grill-ui/result.ts";
import { GRILL_ASK_PARAMETERS, validateGrillAskInput } from "./grill-ui/validate.ts";
import { buildGrillAskRows, rowSelectDisplay } from "./grill-ui/view.ts";
import { expandSkillBlock, type SkillExpansionHost } from "./skill-expansion.ts";

export { type GrillAskDetails } from "./grill-ui/result.ts";
export {
	GRILL_ASK_PARAMETERS,
	RESERVED_GRILL_ASK_VALUES,
	validateGrillAskInput,
	type GrillAskValidationResult,
} from "./grill-ui/validate.ts";

export const GRILL_UI_COMMAND_NAME = "grill-ui";
export const GRILL_ASK_TOOL_NAME = "grill_ask";

const UNKNOWN_SELECTION_MESSAGE =
	"The structured grill question returned an unknown selection. Do not treat this as an answer; summarize what is known or ask whether to continue.";
const BLANK_FREEFORM_MESSAGE =
	"User cancelled the freeform answer or left it blank. Do not treat this as an answer; summarize what is known or ask whether to continue.";

type NotifyLevel = "info" | "warning" | "error";

type TextContent = { type: "text"; text: string };

export type ToolResult<Details = unknown> = {
	content: TextContent[];
	details: Details;
	terminate?: boolean;
};

export type GrillAskOption = {
	value: string;
	label: string;
	description?: string;
};

export type GrillAskRecommendation = {
	answer: string;
	rationale?: string;
	optionValue?: string;
};

export type GrillAskInput = {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	allowFreeform?: boolean;
	allowEnd?: boolean;
};

export type NormalizedGrillAskInput = {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	allowFreeform: boolean;
	allowEnd: boolean;
};

export type GrillAskUiRunner = (
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
) => Promise<GrillAskOutcome | undefined>;

export type GrillAskExecutionOptions = {
	uiRunner?: GrillAskUiRunner;
	signal?: AbortSignal | undefined;
};

export type GrillAskCustomComponent = {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	focused?: boolean;
	dispose?(): void;
};

export type GrillAskToolContext = {
	hasUI: boolean;
	ui: {
		select?(title: string, options: string[]): Promise<string | undefined>;
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		custom?<T>(
			factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => GrillAskCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
};

export type GrillUiCommandContext = {
	hasUI: boolean;
	ui: {
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		notify?(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
};

export type ToolDefinition = {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: object;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: GrillAskToolContext,
	): Promise<ToolResult<GrillAskDetails>> | ToolResult<GrillAskDetails>;
};

export type ExtensionAPI = SkillExpansionHost & {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: GrillUiCommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	sendUserMessage(content: string): void;
};

export const FALLBACK_GRILL_ME_SKILL_BLOCK = `<skill name="grill-me" fallback="true">
Interview the user relentlessly about every aspect of the plan or design until reaching shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
</skill>`;

export const GRILL_UI_CONTRACT = `<structured-grill-question-ui-contract>
Preserve the grill-me behavior and reasoning style. The structured UI is only the interaction primitive for user-facing questions.

When you need user input during this grill session:
- Use the grill_ask tool for every user-facing grill question while it is available.
- Do not ask grill questions in freeform prose while grill_ask is available.
- Ask exactly one question per grill_ask call.
- Explore the codebase instead of asking when the answer can be discovered.
- Avoid double negatives and ambiguous option labels.
- Prefer affirmative, mutually exclusive options.
- Provide 2–5 substantive choices, not counting automatic freeform/end choices.
- Provide your recommended answer and rationale.
- Always allow freeform unless there is a strong reason not to.
- Always allow ending the grilling session.
- If grill_ask returns action: "end_grill", stop asking questions and summarize decisions, unresolved branches, and final recommendation.
- If grill_ask is unavailable or returns action: "ui_unavailable", ask the same one question normally with numbered choices.
</structured-grill-question-ui-contract>`;

export function buildGrillUiPrompt(skillBlock: string | undefined, target: string): string {
	const instructions = skillBlock?.trim() || FALLBACK_GRILL_ME_SKILL_BLOCK;
	return `${instructions}

${GRILL_UI_CONTRACT}

<plan-or-design-to-grill>
${target.trim()}
</plan-or-design-to-grill>`;
}

export function buildGrillAskSelectTitle(input: NormalizedGrillAskInput): string {
	const parts = [`Question:\n${input.question}`];
	if (input.context !== undefined) {
		parts.push(`Context:\n${input.context}`);
	}
	parts.push(`Recommended answer:\n${input.recommended.answer}`);
	if (input.recommended.rationale !== undefined) {
		parts.push(`Recommendation rationale:\n${input.recommended.rationale}`);
	}
	return parts.join("\n\n");
}

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
			return grillAskOutcomeResult(input.question, outcome);
		} catch {
			if (executionOptions.signal?.aborted) {
				return cancelledResult(input.question);
			}
			// Custom UI support can be absent or drift across Pi runtimes. Fall back to the stable legacy dialogs.
		}
	}

	return executeLegacyGrillAsk(input, ctx);
}

export function registerGrillUiExtension(pi: ExtensionAPI): void {
	pi.registerCommand(GRILL_UI_COMMAND_NAME, {
		description: "Start a grill-me session that uses structured question UI.",
		handler: async (args, ctx) => handleGrillUiCommand(pi, args, ctx),
	});

	pi.registerTool({
		name: GRILL_ASK_TOOL_NAME,
		label: "Grill Ask",
		description:
			"Ask exactly one grill-me question through a structured UI with explicit answer choices, an optional recommendation/rationale, a freeform path, and an end-session path.",
		promptSnippet: "Ask one grill-me question through structured choices, freeform, or end-session UI",
		promptGuidelines: [
			"Use grill_ask for each user-facing question in grill-me sessions; do not ask those questions in prose while grill_ask is available.",
			"Ask exactly one question per grill_ask call and include 2–5 affirmative, mutually exclusive options plus your recommendation.",
			"Use grill_ask with freeform and end-session paths enabled unless there is a strong reason not to.",
			"If grill_ask returns action: \"end_grill\", stop asking questions and summarize decisions, unresolved branches, and final recommendation.",
			"If grill_ask returns action: \"ui_unavailable\", ask the same one question normally with numbered choices.",
		],
		parameters: GRILL_ASK_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeGrillAsk(params, ctx, { signal }),
	});
}

export async function handleGrillUiCommand(pi: ExtensionAPI, args: string, ctx: GrillUiCommandContext): Promise<void> {
	await ctx.waitForIdle();
	const target = await resolveGrillTarget(args, ctx);
	if (target.trim().length === 0) {
		notify(ctx, "No plan/design provided for /grill-ui.", "warning");
		return;
	}

	let skillBlock: string | undefined;
	try {
		skillBlock = (await expandSkillBlock(pi, "grill-me"))?.block;
	} catch {
		notify(ctx, "Could not expand grill-me skill; using fallback grill instructions.", "warning");
	}

	pi.sendUserMessage(buildGrillUiPrompt(skillBlock, target));
}

export default registerGrillUiExtension;

async function resolveGrillTarget(args: string, ctx: GrillUiCommandContext): Promise<string> {
	const trimmedArgs = args.trim();
	if (trimmedArgs.length > 0) {
		return trimmedArgs;
	}
	if (!ctx.hasUI || ctx.ui.editor === undefined) {
		return "";
	}
	return (await ctx.ui.editor("What plan or design should be grilled?", "")) ?? "";
}

async function executeLegacyGrillAsk(input: NormalizedGrillAskInput, ctx: GrillAskToolContext): Promise<ToolResult<GrillAskDetails>> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		return textResult(
			"Structured grill question UI is unavailable. Ask the same one question normally with numbered choices.",
			{ action: "ui_unavailable", question: input.question },
		);
	}

	const rows = buildGrillAskRows(input);
	const displays = rows.map(rowSelectDisplay);
	const selectedDisplay = await ctx.ui.select(buildGrillAskSelectTitle(input), displays);
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
		case "end_grill":
			return endGrillResult(input.question);
		default: {
			const exhaustive: never = selectedRow;
			return exhaustive;
		}
	}
}

async function executeLegacyFreeformAnswer(input: NormalizedGrillAskInput, ctx: GrillAskToolContext): Promise<ToolResult<GrillAskDetails>> {
	if (ctx.ui.editor === undefined) {
		return textResult(
			"Structured grill freeform editor is unavailable. Ask the same one question normally with numbered choices and an Other/freeform option.",
			{ action: "ui_unavailable", question: input.question },
		);
	}
	const answer = await ctx.ui.editor("Freeform answer", "");
	if (answer === undefined || answer.trim().length === 0) {
		return cancelledResult(input.question, BLANK_FREEFORM_MESSAGE);
	}
	return freeformAnswerResult(input.question, answer);
}

function grillAskOutcomeResult(question: string, outcome: GrillAskOutcome): ToolResult<GrillAskDetails> {
	switch (outcome.action) {
		case "choice":
			return selectedChoiceResult(question, outcome.entry);
		case "freeform":
			return freeformAnswerResult(question, outcome.answer);
		case "end_grill":
			return endGrillResult(question);
		case "cancelled":
			return cancelledResult(question);
		default: {
			const exhaustive: never = outcome;
			return exhaustive;
		}
	}
}

function notify(ctx: GrillUiCommandContext, message: string, level: NotifyLevel): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify?.(message, level);
}

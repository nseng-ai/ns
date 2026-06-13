import type { GrillAskOutcome } from "./grill-ui/controller.ts";
import { runGrillAskInlineUi } from "./grill-ui/inline-ui.ts";
import {
	cancelledResult,
	endGrillResult,
	freeformAnswerResult,
	invalidToolInputResult,
	selectedChoiceResult,
	statusRequestResult,
	textResult,
	type GrillAskDetails,
} from "./grill-ui/result.ts";
import { formatGrillAskProgressLine, readGrillAskProgress, type GrillAskProgress } from "./grill-ui/progress.ts";
import { GRILL_ASK_PARAMETERS, validateGrillAskInput } from "./grill-ui/validate.ts";
import { buildGrillAskRows, rowSelectDisplay } from "./grill-ui/view.ts";
import { definePiSurfaceParity } from "./parity.ts";
import { expandSkillBlock, type SkillExpansionHost } from "./skill-expansion.ts";

export { type GrillAskDetails } from "./grill-ui/result.ts";
export {
	GRILL_ASK_PARAMETERS,
	RESERVED_GRILL_ASK_VALUES,
	validateGrillAskInput,
	type GrillAskValidationResult,
} from "./grill-ui/validate.ts";

export const GRILL_UI_COMMAND_NAME = "pi:grill-me";
export const GRILL_WITH_DOCS_UI_COMMAND_NAME = "pi:grill-with-docs";
export const GRILL_ASK_TOOL_NAME = "grill_ask";
export const GRILL_UI_SKILL_NAME = "pi-grill-ui";

export const grillUiParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: GRILL_UI_COMMAND_NAME,
		workflow: "Start a structured grilling interview",
		parity: "WAIVED",
		fallback: "Use the grill-me skill for a prose interview outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "grill-ui",
		notes: "Structured TUI interaction is Pi-native; portable fallback is the skill workflow.",
	},
	{
		kind: "command",
		surface: GRILL_WITH_DOCS_UI_COMMAND_NAME,
		workflow: "Start a docs-aware structured grilling interview",
		parity: "WAIVED",
		fallback: "Use the grill-with-docs skill for a prose docs-aware interview outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "grill-ui",
		notes: "Structured TUI interaction is Pi-native; portable fallback is the docs-aware skill workflow.",
	},
] as const);
export const GRILL_WITH_DOCS_UI_SKILL_NAME = "pi-grill-with-docs-ui";

const UNKNOWN_SELECTION_MESSAGE =
	"The structured grill question returned an unknown selection. Do not treat this as an answer; summarize what is known or ask whether to continue.";
const BLANK_FREEFORM_MESSAGE =
	"User cancelled the freeform answer or left it blank. Do not treat this as an answer; summarize what is known or ask whether to continue.";

type NotifyLevel = "info" | "warning" | "error";

interface TextContent {
	type: "text";
	text: string;
}

export interface ToolResult<Details = unknown> {
	content: TextContent[];
	details: Details;
	terminate?: boolean;
}

export interface GrillAskOption {
	value: string;
	label: string;
	description?: string;
}

export interface GrillAskRecommendation {
	answer: string;
	rationale?: string;
	optionValue?: string;
}

export type GrillAskRemainingEstimate =
	| {
			kind: "exact";
			count: number;
			basis?: string;
	  }
	| {
			kind: "range";
			min: number;
			max: number;
			basis: string;
	  }
	| {
			kind: "unknown";
			basis: string;
	  };

export interface GrillAskInput {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	estimatedRemaining?: GrillAskRemainingEstimate;
	allowFreeform?: boolean;
	allowEnd?: boolean;
}

export interface NormalizedGrillAskInput {
	question: string;
	context?: string;
	recommended: GrillAskRecommendation;
	options: GrillAskOption[];
	estimatedRemaining?: GrillAskRemainingEstimate;
	allowFreeform: boolean;
	allowEnd: boolean;
}

export type GrillAskUiRunner = (
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
) => Promise<GrillAskOutcome | undefined>;

export interface GrillAskExecutionOptions {
	uiRunner?: GrillAskUiRunner;
	signal?: AbortSignal | undefined;
}

export interface GrillAskCustomComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	focused?: boolean;
	dispose?(): void;
}

export interface GrillAskToolContext {
	hasUI: boolean;
	ui: {
		select?(title: string, options: string[]): Promise<string | undefined>;
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		custom?<T>(
			factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => GrillAskCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
	sessionManager?: {
		getBranch(): readonly unknown[];
	};
}

export interface GrillUiCommandContext {
	hasUI: boolean;
	ui: {
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		notify?(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ToolDefinition {
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
}

export interface ExtensionAPI extends SkillExpansionHost {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: GrillUiCommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	sendUserMessage(content: string): void;
}

export const FALLBACK_GRILL_UI_SKILL_BLOCK = `<skill name="${GRILL_UI_SKILL_NAME}" fallback="true">
Interview the user relentlessly about every aspect of the plan or design until reaching shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
</skill>`;

export const FALLBACK_GRILL_WITH_DOCS_UI_SKILL_BLOCK = `<skill name="${GRILL_WITH_DOCS_UI_SKILL_NAME}" fallback="true">
This is the Pi structured-UI complement to grill-with-docs. Interview the user relentlessly about the plan or design while challenging it against the repository's documented domain language.

Before the first user-facing question, do a bounded docs-first preflight: check CONTEXT-MAP.md if present, check root or relevant CONTEXT.md files, check relevant docs/adr/ records, and inspect code only when the target names a concrete area or a claim needs verification.

Ask one question at a time. Use grill_ask for user-facing grill questions when available. Explore the codebase instead of asking when the answer can be discovered.

Challenge glossary conflicts immediately, sharpen fuzzy terms into canonical project language, and update CONTEXT.md inline when a term is resolved. Keep CONTEXT.md as a glossary only, without implementation details.

Offer ADRs sparingly only when all three are true: the decision is hard to reverse, surprising without context, and the result of a real trade-off.

When reporting status, include a Documentation updates line summarizing CONTEXT.md edits, ADRs created or offered, or none yet.
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
- Provide 2–5 substantive choices, not counting automatic freeform/status/end choices.
- Provide your recommended answer and rationale.
- Provide estimatedRemaining on every grill_ask call. Use exact only when you know; otherwise use a range with a basis or unknown with a basis. Do not invent precision.
- Always allow freeform unless there is a strong reason not to.
- Always allow ending the grilling session.
- If grill_ask returns action: "end_grill", stop asking questions and summarize decisions, unresolved branches, and final recommendation.
- If grill_ask returns action: "status_request", the user has not answered the current question. Produce a compact status report with answered count, estimated remaining questions, current pending question, resolved decisions, unresolved branches, and current recommendation. Then re-ask the exact same pending question with grill_ask; do not advance to a new question and do not count the status request as an answer.
- If grill_ask is unavailable or returns action: "ui_unavailable", ask the same one question normally with numbered choices, including Other/freeform when allowed, Show current grill status, and End grilling session when allowed.
</structured-grill-question-ui-contract>`;

export function buildGrillUiPrompt(skillBlock: string | undefined, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, FALLBACK_GRILL_UI_SKILL_BLOCK, target);
}

export function buildGrillWithDocsUiPrompt(skillBlock: string | undefined, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, FALLBACK_GRILL_WITH_DOCS_UI_SKILL_BLOCK, target);
}

export function buildGrillAskSelectTitle(input: NormalizedGrillAskInput, progress: GrillAskProgress = { source: "unavailable" }): string {
	const parts = [formatGrillAskProgressLine(progress, input.estimatedRemaining), `Question:\n${input.question}`];
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

export function registerGrillUiExtension(pi: ExtensionAPI): void {
	pi.registerCommand(GRILL_UI_COMMAND_NAME, {
		description: "Start a grill-me session that uses structured question UI.",
		handler: async (args, ctx) => handleGrillUiCommand(pi, args, ctx),
	});

	pi.registerCommand(GRILL_WITH_DOCS_UI_COMMAND_NAME, {
		description: "Start a docs-aware grill-with-docs session that uses structured question UI.",
		handler: async (args, ctx) => handleGrillWithDocsUiCommand(pi, args, ctx),
	});

	pi.registerTool({
		name: GRILL_ASK_TOOL_NAME,
		label: "Grill Ask",
		description:
			"Ask exactly one grill-me question through a structured UI with explicit answer choices, an optional recommendation/rationale, an honest remaining-question estimate, a freeform path, a status checkpoint path, and an end-session path.",
		promptSnippet: "Ask one grill-me question through structured choices, freeform, status, or end-session UI",
		promptGuidelines: [
			"Use grill_ask for each user-facing question in grill-me sessions; do not ask those questions in prose while grill_ask is available.",
			"Ask exactly one question per grill_ask call and include 2–5 affirmative, mutually exclusive options plus your recommendation.",
			"Include estimatedRemaining on every grill_ask call; use exact only when known, otherwise use a range with basis or unknown with basis.",
			"Use grill_ask with freeform and end-session paths enabled unless there is a strong reason not to.",
			"If grill_ask returns action: \"end_grill\", stop asking questions and summarize decisions, unresolved branches, and final recommendation.",
			"If grill_ask returns action: \"status_request\", use the requested status-report format, then call grill_ask again with the same pending question; do not treat the status request as an answer.",
			"If grill_ask returns action: \"ui_unavailable\", ask the same one question normally with numbered choices, including Other/freeform, Show current grill status, and End grilling session when applicable.",
		],
		parameters: GRILL_ASK_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeGrillAsk(params, ctx, { signal }),
	});
}

export async function handleGrillUiCommand(pi: ExtensionAPI, args: string, ctx: GrillUiCommandContext): Promise<void> {
	await handleStructuredGrillCommand(pi, args, ctx, {
		skillName: GRILL_UI_SKILL_NAME,
		emptyTargetMessage: "No plan/design provided for /pi:grill-me.",
		expansionFailureMessage: "Could not expand pi-grill-ui skill; using fallback grill instructions.",
		editorTitle: "What plan or design should be grilled?",
		buildPrompt: buildGrillUiPrompt,
	});
}

export async function handleGrillWithDocsUiCommand(pi: ExtensionAPI, args: string, ctx: GrillUiCommandContext): Promise<void> {
	await handleStructuredGrillCommand(pi, args, ctx, {
		skillName: GRILL_WITH_DOCS_UI_SKILL_NAME,
		emptyTargetMessage: "No plan/design provided for /pi:grill-with-docs.",
		expansionFailureMessage: "Could not expand pi-grill-with-docs-ui skill; using fallback docs-aware grill instructions.",
		editorTitle: "What plan or design should be grilled against docs?",
		buildPrompt: buildGrillWithDocsUiPrompt,
	});
}

export default registerGrillUiExtension;

interface StructuredGrillCommandOptions {
	skillName: string;
	emptyTargetMessage: string;
	expansionFailureMessage: string;
	editorTitle: string;
	buildPrompt(skillBlock: string | undefined, target: string): string;
}

function buildStructuredGrillPrompt(skillBlock: string | undefined, fallbackSkillBlock: string, target: string): string {
	const instructions = skillBlock?.trim() || fallbackSkillBlock;
	return `${instructions}

${GRILL_UI_CONTRACT}

<plan-or-design-to-grill>
${target.trim()}
</plan-or-design-to-grill>`;
}

async function handleStructuredGrillCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: GrillUiCommandContext,
	options: StructuredGrillCommandOptions,
): Promise<void> {
	await ctx.waitForIdle();
	const target = await resolveGrillTarget(args, ctx, options.editorTitle);
	if (target.trim().length === 0) {
		notify(ctx, options.emptyTargetMessage, "warning");
		return;
	}

	let skillBlock: string | undefined;
	try {
		skillBlock = (await expandSkillBlock(pi, options.skillName))?.block;
	} catch {
		notify(ctx, options.expansionFailureMessage, "warning");
	}

	pi.sendUserMessage(options.buildPrompt(skillBlock, target));
}

async function resolveGrillTarget(args: string, ctx: GrillUiCommandContext, editorTitle: string): Promise<string> {
	const trimmedArgs = args.trim();
	if (trimmedArgs.length > 0) {
		return trimmedArgs;
	}
	if (!ctx.hasUI || ctx.ui.editor === undefined) {
		return "";
	}
	return (await ctx.ui.editor(editorTitle, "")) ?? "";
}

async function executeLegacyGrillAsk(input: NormalizedGrillAskInput, ctx: GrillAskToolContext): Promise<ToolResult<GrillAskDetails>> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		return textResult(
			"Structured grill question UI is unavailable. Ask the same one question normally with numbered choices, including the explicit choices, Other/freeform when allowed, Show current grill status, and End grilling session when allowed.",
			{ action: "ui_unavailable", question: input.question },
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
			"Structured grill freeform editor is unavailable. Ask the same one question normally with numbered choices, an Other/freeform option, Show current grill status, and End grilling session when allowed.",
			{ action: "ui_unavailable", question: input.question },
		);
	}
	const answer = await ctx.ui.editor("Freeform answer", "");
	if (answer === undefined || answer.trim().length === 0) {
		return cancelledResult(input.question, BLANK_FREEFORM_MESSAGE);
	}
	return freeformAnswerResult(input.question, answer);
}

function grillAskOutcomeResult(input: NormalizedGrillAskInput, outcome: GrillAskOutcome, ctx: GrillAskToolContext): ToolResult<GrillAskDetails> {
	switch (outcome.action) {
		case "choice":
			return selectedChoiceResult(input.question, outcome.entry);
		case "freeform":
			return freeformAnswerResult(input.question, outcome.answer);
		case "status_request":
			return statusRequestResult(input.question, readGrillAskProgress(ctx), input.estimatedRemaining);
		case "end_grill":
			return endGrillResult(input.question);
		case "cancelled":
			return cancelledResult(input.question);
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

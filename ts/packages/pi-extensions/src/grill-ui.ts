import type { GrillAskOutcome } from "./grill-ui/controller.ts";
import { runGrillAskOverlay } from "./grill-ui/overlay.ts";
import { buildGrillAskSelectorEntriesFromRows, type GrillAskChoiceRow } from "./grill-ui/view.ts";
import { expandSkillBlock, type SkillExpansionHost } from "./skill-expansion.ts";

export const GRILL_UI_COMMAND_NAME = "grill-ui";
export const GRILL_ASK_TOOL_NAME = "grill_ask";
export const GRILL_UI_STATUS_KEY = "grill-ui";

export const RESERVED_GRILL_ASK_VALUES = new Set(["__freeform__", "__end_grill__", "__cancelled__"]);

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

export type GrillAskInput = {
	question: string;
	context?: string;
	recommended: {
		answer: string;
		rationale?: string;
		optionValue?: string;
	};
	options: GrillAskOption[];
	allowFreeform?: boolean;
	allowEnd?: boolean;
};

export type NormalizedGrillAskInput = {
	question: string;
	context?: string;
	recommended: {
		answer: string;
		rationale?: string;
		optionValue?: string;
	};
	options: GrillAskOption[];
	allowFreeform: boolean;
	allowEnd: boolean;
};

export type GrillAskDetails =
	| {
			action: "answer";
			kind: "choice";
			question: string;
			value: string;
			label: string;
			description?: string;
			recommended: boolean;
	  }
	| {
			action: "answer";
			kind: "freeform";
			question: string;
			answer: string;
	  }
	| {
			action: "end_grill";
			question: string;
	  }
	| {
			action: "cancelled";
			question: string;
	  }
	| {
			action: "ui_unavailable";
			question: string;
	  }
	| {
			action: "invalid_tool_input";
			errors: string[];
	  };

export type GrillAskValidationResult =
	| { ok: true; input: NormalizedGrillAskInput }
	| { ok: false; errors: string[] };

export type GrillAskOverlayRunner = (
	input: NormalizedGrillAskInput,
	ctx: GrillAskToolContext,
) => Promise<GrillAskOutcome | undefined>;

export type GrillAskExecutionOptions = {
	overlayRunner?: GrillAskOverlayRunner;
	signal?: AbortSignal | undefined;
};

export type GrillAskSelectorEntry =
	| {
			kind: "choice";
			display: string;
			index: number;
			option: GrillAskOption;
			recommended: boolean;
	  }
	| {
			kind: "freeform";
			display: string;
	  }
	| {
			kind: "end_grill";
			display: string;
	  };

export type GrillAskCustomComponent = {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	focused?: boolean;
	dispose?(): void;
};

export type GrillAskCustomOptions = {
	overlay?: boolean;
	overlayOptions?: unknown;
};

export type GrillAskToolContext = {
	hasUI: boolean;
	ui: {
		select?(title: string, options: string[]): Promise<string | undefined>;
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		custom?<T>(
			factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => GrillAskCustomComponent,
			options?: GrillAskCustomOptions,
		): Promise<T>;
	};
};

export type GrillUiCommandContext = {
	hasUI: boolean;
	ui: {
		editor?(title: string, initialText?: string): Promise<string | undefined>;
		notify?(message: string, level?: NotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
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

export const GRILL_ASK_PARAMETERS = {
	type: "object",
	properties: {
		question: {
			type: "string",
			description: "Exactly one grill-me question to ask the user.",
		},
		context: {
			type: "string",
			description: "Optional short context or why-this-matters text for the question.",
		},
		recommended: {
			type: "object",
			description: "The model's recommended answer and optional rationale.",
			properties: {
				answer: {
					type: "string",
					description: "The recommended answer in user-facing prose.",
				},
				rationale: {
					type: "string",
					description: "Optional concise rationale for the recommendation.",
				},
				optionValue: {
					type: "string",
					description: "Optional value of the explicit option that matches the recommendation.",
				},
			},
			required: ["answer"],
			additionalProperties: false,
		},
		options: {
			type: "array",
			description: "Two to five substantive explicit choices for the user.",
			minItems: 2,
			maxItems: 5,
			items: {
				type: "object",
				properties: {
					value: {
						type: "string",
						description: "Stable machine-readable value for this option.",
					},
					label: {
						type: "string",
						description: "User-facing affirmative option label.",
					},
					description: {
						type: "string",
						description: "Optional short description shown with this option.",
					},
				},
				required: ["value", "label"],
				additionalProperties: false,
			},
		},
		allowFreeform: {
			type: "boolean",
			description: "Whether to include an Other/freeform answer path. Defaults to true.",
		},
		allowEnd: {
			type: "boolean",
			description: "Whether to include an End grilling session path. Defaults to true.",
		},
	},
	required: ["question", "recommended", "options"],
	additionalProperties: false,
} as const;

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

export function validateGrillAskInput(params: unknown): GrillAskValidationResult {
	const errors: string[] = [];
	if (!isRecord(params)) {
		return { ok: false, errors: ["Input must be a JSON object."] };
	}

	const rawQuestion = params.question;
	const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
	if (question.length === 0) {
		errors.push("question must be a non-empty string.");
	}

	const rawContext = params.context;
	let context: string | undefined;
	if (rawContext !== undefined) {
		if (typeof rawContext !== "string") {
			errors.push("context must be a string when supplied.");
		} else {
			const trimmed = rawContext.trim();
			if (trimmed.length > 0) context = trimmed;
		}
	}

	const rawRecommended = params.recommended;
	let recommendedAnswer = "";
	let recommendedRationale: string | undefined;
	let recommendedOptionValue: string | undefined;
	if (!isRecord(rawRecommended)) {
		errors.push("recommended must be an object with a non-empty answer.");
	} else {
		if (typeof rawRecommended.answer !== "string" || rawRecommended.answer.trim().length === 0) {
			errors.push("recommended.answer must be a non-empty string.");
		} else {
			recommendedAnswer = rawRecommended.answer.trim();
		}
		if (rawRecommended.rationale !== undefined) {
			if (typeof rawRecommended.rationale !== "string") {
				errors.push("recommended.rationale must be a string when supplied.");
			} else {
				const trimmed = rawRecommended.rationale.trim();
				if (trimmed.length > 0) recommendedRationale = trimmed;
			}
		}
		if (rawRecommended.optionValue !== undefined) {
			if (typeof rawRecommended.optionValue !== "string" || rawRecommended.optionValue.trim().length === 0) {
				errors.push("recommended.optionValue must be a non-empty string when supplied.");
			} else {
				recommendedOptionValue = rawRecommended.optionValue.trim();
			}
		}
	}

	const rawOptions = params.options;
	const options: GrillAskOption[] = [];
	const optionValues = new Set<string>();
	if (!Array.isArray(rawOptions)) {
		errors.push("options must be an array of 2–5 choices.");
	} else {
		if (rawOptions.length < 2 || rawOptions.length > 5) {
			errors.push("options must contain 2–5 substantive choices.");
		}

		for (const [index, rawOption] of rawOptions.entries()) {
			if (!isRecord(rawOption)) {
				errors.push(`options[${index}] must be an object.`);
				continue;
			}

			const rawValue = rawOption.value;
			const rawLabel = rawOption.label;
			const value = typeof rawValue === "string" ? rawValue.trim() : "";
			const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
			let description: string | undefined;

			if (value.length === 0) {
				errors.push(`options[${index}].value must be a non-empty string.`);
			} else if (RESERVED_GRILL_ASK_VALUES.has(value)) {
				errors.push(`options[${index}].value uses reserved value ${value}.`);
			} else if (optionValues.has(value)) {
				errors.push(`options[${index}].value duplicates ${value}.`);
			} else {
				optionValues.add(value);
			}

			if (label.length === 0) {
				errors.push(`options[${index}].label must be a non-empty string.`);
			}

			if (rawOption.description !== undefined) {
				if (typeof rawOption.description !== "string") {
					errors.push(`options[${index}].description must be a string when supplied.`);
				} else {
					const trimmed = rawOption.description.trim();
					if (trimmed.length > 0) description = trimmed;
				}
			}

			if (value.length > 0 && label.length > 0 && !RESERVED_GRILL_ASK_VALUES.has(value)) {
				options.push({
					value,
					label,
					...(description === undefined ? {} : { description }),
				});
			}
		}
	}

	if (recommendedOptionValue !== undefined && !optionValues.has(recommendedOptionValue)) {
		errors.push("recommended.optionValue must match one of the option values.");
	}

	const rawAllowFreeform = params.allowFreeform;
	const allowFreeform = rawAllowFreeform === undefined ? true : rawAllowFreeform;
	if (typeof allowFreeform !== "boolean") {
		errors.push("allowFreeform must be a boolean when supplied.");
	}

	const rawAllowEnd = params.allowEnd;
	const allowEnd = rawAllowEnd === undefined ? true : rawAllowEnd;
	if (typeof allowEnd !== "boolean") {
		errors.push("allowEnd must be a boolean when supplied.");
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		input: {
			question,
			...(context === undefined ? {} : { context }),
			recommended: {
				answer: recommendedAnswer,
				...(recommendedRationale === undefined ? {} : { rationale: recommendedRationale }),
				...(recommendedOptionValue === undefined ? {} : { optionValue: recommendedOptionValue }),
			},
			options,
			allowFreeform: allowFreeform as boolean,
			allowEnd: allowEnd as boolean,
		},
	};
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

export function buildGrillAskSelectorEntries(input: NormalizedGrillAskInput): GrillAskSelectorEntry[] {
	return buildGrillAskSelectorEntriesFromRows(input);
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
		return cancelledResult(input.question, "User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.");
	}

	if (ctx.hasUI && ctx.ui.custom !== undefined) {
		const overlayRunner = executionOptions.overlayRunner ?? runGrillAskOverlay;
		try {
			const outcome = await overlayRunner(input, ctx);
			if (outcome === undefined) {
				return cancelledResult(input.question, "User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.");
			}
			return grillAskOutcomeResult(input.question, outcome);
		} catch {
			if (executionOptions.signal?.aborted) {
				return cancelledResult(input.question, "User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.");
			}
			// Overlay support can be absent or drift across Pi runtimes. Fall back to the stable legacy dialogs.
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

	const entries = buildGrillAskSelectorEntries(input);
	const selectedDisplay = await ctx.ui.select(
		buildGrillAskSelectTitle(input),
		entries.map((entry) => entry.display),
	);
	if (selectedDisplay === undefined) {
		return cancelledResult(input.question, "User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.");
	}

	const selectedEntry = entries.find((entry) => entry.display === selectedDisplay);
	if (selectedEntry === undefined) {
		return cancelledResult(input.question, "The structured grill question returned an unknown selection. Do not treat this as an answer; summarize what is known or ask whether to continue.");
	}

	switch (selectedEntry.kind) {
		case "choice":
			return selectedChoiceResult(input.question, selectedEntry);
		case "freeform":
			return executeLegacyFreeformAnswer(input, ctx);
		case "end_grill":
			return endGrillResult(input.question);
		default: {
			const exhaustive: never = selectedEntry;
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
		return cancelledResult(input.question, "User cancelled the freeform answer or left it blank. Do not treat this as an answer; summarize what is known or ask whether to continue.");
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
			return cancelledResult(question, "User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.");
		default: {
			const exhaustive: never = outcome;
			return exhaustive;
		}
	}
}

function freeformAnswerResult(question: string, answer: string): ToolResult<GrillAskDetails> {
	const trimmedAnswer = answer.trim();
	return textResult(`User provided a freeform answer: ${trimmedAnswer}`, {
		action: "answer",
		kind: "freeform",
		question,
		answer: trimmedAnswer,
	});
}

function endGrillResult(question: string): ToolResult<GrillAskDetails> {
	return textResult(
		"User chose to end the grilling session. Stop asking questions and summarize resolved decisions, unresolved branches, and your final recommendation.",
		{ action: "end_grill", question },
	);
}

function selectedChoiceResult(question: string, selectedEntry: Extract<GrillAskSelectorEntry, { kind: "choice" }> | GrillAskChoiceRow): ToolResult<GrillAskDetails> {
	const details: GrillAskDetails = {
		action: "answer",
		kind: "choice",
		question,
		value: selectedEntry.option.value,
		label: selectedEntry.option.label,
		...(selectedEntry.option.description === undefined ? {} : { description: selectedEntry.option.description }),
		recommended: selectedEntry.recommended,
	};
	return textResult(
		[`User selected option \`${selectedEntry.option.value}\`: ${selectedEntry.option.label}`, `Recommended option selected: ${selectedEntry.recommended ? "true" : "false"}`].join("\n"),
		details,
	);
}

function invalidToolInputResult(errors: string[]): ToolResult<GrillAskDetails> {
	return textResult(`Invalid grill_ask input:\n${errors.map((error) => `- ${error}`).join("\n")}\nRepair the tool call with one non-empty question, a recommendation, and 2–5 valid explicit choices.`, {
		action: "invalid_tool_input",
		errors,
	});
}

function cancelledResult(question: string, text: string): ToolResult<GrillAskDetails> {
	return textResult(text, { action: "cancelled", question });
}

function textResult<Details extends GrillAskDetails>(text: string, details: Details): ToolResult<Details> {
	return {
		content: [{ type: "text", text }],
		details,
	};
}

function notify(ctx: GrillUiCommandContext, message: string, level: NotifyLevel): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify?.(message, level);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { z } from "zod";

const roundOptionSchema = z.lazy(() =>
	z.strictObject({
		value: z.string().trim().min(1),
		label: z.string().trim().min(1),
		description: z.string().trim().min(1).optional(),
	}),
);

const roundQuestionSchema = z.lazy(() =>
	z.strictObject({
		id: z.string().trim().min(1),
		question: z.string().trim().min(1),
		context: z.string().trim().min(1).optional(),
		options: z.array(roundOptionSchema).min(2).max(5),
		recommendedOptionValue: z.string().trim().min(1),
		recommendationRationale: z.string().trim().min(1),
	}),
);

const decisionRoundSchema = z.lazy(() =>
	z.strictObject({
		mode: z.literal("decision-round"),
		roundId: z.string().trim().min(1),
		questions: z.array(roundQuestionSchema).min(1),
	}),
);

const confirmationRoundSchema = z.lazy(() =>
	z.strictObject({
		mode: z.literal("confirmation"),
		summary: z.string().trim().min(1),
	}),
);

export const grillRoundInputSchema = z.lazy(() =>
	z.discriminatedUnion("mode", [decisionRoundSchema, confirmationRoundSchema]),
);

export const GRILL_ASK_ROUND_PARAMETERS = {
	type: "object",
	description:
		"One atomic grill interaction: either the complete ordered decision frontier or final shared-understanding confirmation.",
	oneOf: [
		{
			type: "object",
			description:
				"Present the complete currently answerable frontier in design-tree order. Submit all answers atomically.",
			properties: {
				mode: { type: "string", const: "decision-round" },
				roundId: {
					type: "string",
					description: "Stable attempt-scoped ID, unique across submitted rounds.",
				},
				questions: {
					type: "array",
					minItems: 1,
					description:
						"The complete ordered frontier of currently answerable decisions; never an arbitrary subset.",
					items: {
						type: "object",
						properties: {
							id: {
								type: "string",
								description: "Stable attempt-scoped decision ID, never reused.",
							},
							question: { type: "string", description: "One user decision in affirmative form." },
							context: { type: "string", description: "Optional concise decision context." },
							options: {
								type: "array",
								minItems: 2,
								maxItems: 5,
								description:
									"Two to five substantive, mutually exclusive choices. The UI also provides freeform.",
								items: {
									type: "object",
									properties: {
										value: { type: "string", description: "Stable machine-readable choice ID." },
										label: { type: "string", description: "Affirmative user-facing choice." },
										description: { type: "string", description: "Optional choice rationale." },
									},
									required: ["value", "label"],
									additionalProperties: false,
								},
							},
							recommendedOptionValue: {
								type: "string",
								description: "Value of exactly one listed recommended choice.",
							},
							recommendationRationale: {
								type: "string",
								description: "Concise rationale for the recommendation.",
							},
						},
						required: [
							"id",
							"question",
							"options",
							"recommendedOptionValue",
							"recommendationRationale",
						],
						additionalProperties: false,
					},
				},
			},
			required: ["mode", "roundId", "questions"],
			additionalProperties: false,
		},
		{
			type: "object",
			description: "Final confirmation after the frontier is empty.",
			properties: {
				mode: { type: "string", const: "confirmation" },
				summary: {
					type: "string",
					description:
						"Explicit summary of resolved decisions, remaining non-decision caveats, and recommendation. The UI offers only Confirm shared understanding or Return to grilling.",
				},
			},
			required: ["mode", "summary"],
			additionalProperties: false,
		},
	],
} as const;

export type GrillRoundInput = z.infer<typeof grillRoundInputSchema>;
export type GrillDecisionRoundInput = Extract<GrillRoundInput, { mode: "decision-round" }>;
export type GrillRoundQuestion = GrillDecisionRoundInput["questions"][number];
export type GrillRoundOption = GrillRoundQuestion["options"][number];

export type GrillRoundAnswer =
	| {
			questionId: string;
			kind: "option";
			value: string;
			label: string;
			recommendation: "retained" | "changed";
	  }
	| {
			questionId: string;
			kind: "freeform";
			value: string;
			recommendation: "changed";
	  };

export type GrillRoundUiOutcome =
	| { action: "submitted"; answers: readonly GrillRoundAnswer[] }
	| { action: "cancelled" }
	| { action: "ended" }
	| { action: "confirmed" }
	| { action: "return-to-grilling" };

export type GrillRoundDetails =
	| {
			action: "submitted";
			mode: "decision-round";
			roundId: string;
			answers: readonly GrillRoundAnswer[];
			submittedRoundCount: number;
			answeredDecisionCount: number;
	  }
	| {
			action: "cancelled" | "ended" | "ui-failed" | "cap-exhausted";
			mode: "decision-round";
			roundId: string;
	  }
	| {
			action: "confirmed" | "return-to-grilling" | "ui-failed";
			mode: "confirmation";
	  }
	| { action: "invalid-tool-input"; errors: readonly string[] };

export interface GrillRoundToolResult {
	content: Array<{ type: "text"; text: string }>;
	details: GrillRoundDetails;
	terminate?: boolean;
}

export interface GrillRoundToolContext {
	hasUI: boolean;
	ui: {
		custom?<T>(
			factory: (
				tui: unknown,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => GrillRoundCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
	sessionManager?: { getBranch(): readonly unknown[] };
}

export interface GrillRoundCustomComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	isFocused?: boolean;
	dispose?(): void;
}

export interface GrillRoundExecutionOptions {
	signal?: AbortSignal;
	uiRunner?: (
		input: GrillRoundInput,
		ctx: GrillRoundToolContext,
		signal?: AbortSignal,
	) => Promise<GrillRoundUiOutcome | undefined>;
}

export type GrillRoundValidation =
	| { ok: true; input: GrillRoundInput; oversized: boolean }
	| { ok: false; errors: readonly string[] };

/** Validate the complete round atomically, including cross-field identities. */
export function validateGrillRoundInput(value: unknown): GrillRoundValidation {
	const parsed = grillRoundInputSchema.safeParse(value);
	if (!parsed.success) {
		return { ok: false, errors: parsed.error.issues.map(formatIssue) };
	}
	if (parsed.data.mode === "confirmation") {
		return { ok: true, input: parsed.data, oversized: false };
	}

	const errors: string[] = [];
	const questionIds = new Set<string>();
	for (const [index, question] of parsed.data.questions.entries()) {
		if (questionIds.has(question.id))
			errors.push(`questions[${index}].id duplicates ${question.id}.`);
		questionIds.add(question.id);
		const values = new Set<string>();
		for (const [optionIndex, option] of question.options.entries()) {
			if (values.has(option.value)) {
				errors.push(
					`questions[${index}].options[${optionIndex}].value duplicates ${option.value}.`,
				);
			}
			values.add(option.value);
		}
		const mappings = question.options.filter(
			(option) => option.value === question.recommendedOptionValue,
		);
		if (mappings.length !== 1) {
			errors.push(`questions[${index}].recommendedOptionValue must map to exactly one option.`);
		}
	}
	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		input: parsed.data,
		oversized: parsed.data.questions.length > 8,
	};
}

function formatIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length === 0 ? "input" : issue.path.join(".");
	return `${path}: ${issue.message}`;
}

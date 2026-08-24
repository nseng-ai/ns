import { z } from "zod";

export const grillRoundInputSchema = z.lazy(() =>
	z.discriminatedUnion("mode", [
		z.strictObject({
			mode: z.literal("decision-round"),
			roundId: z.string().trim().min(1),
			questions: z
				.array(
					z.strictObject({
						id: z.string().trim().min(1),
						question: z.string().trim().min(1),
						context: z.string().trim().min(1).optional(),
						options: z
							.array(
								z.strictObject({
									value: z.string().trim().min(1),
									label: z.string().trim().min(1),
									description: z.string().trim().min(1).optional(),
								}),
							)
							.min(2)
							.max(5),
						recommendedOptionValue: z.string().trim().min(1),
						recommendationRationale: z.string().trim().min(1),
					}),
				)
				.min(1),
		}),
		z.strictObject({
			mode: z.literal("confirmation"),
			summary: z.string().trim().min(1),
		}),
	]),
);

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

export type GrillDecisionRoundUiOutcome =
	| { action: "submitted"; answers: readonly GrillRoundAnswer[] }
	| { action: "cancelled" }
	| { action: "ended" };

export type GrillConfirmationUiOutcome = { action: "confirmed" } | { action: "return-to-grilling" };

export type GrillRoundUiOutcome = GrillDecisionRoundUiOutcome | GrillConfirmationUiOutcome;

export type GrillRoundDetails =
	| {
			action: "submitted";
			mode: "decision-round";
			roundId: string;
			answers: GrillRoundAnswer[];
	  }
	| {
			action: "cancelled" | "ended" | "ui-failed";
			mode: "decision-round";
			roundId: string;
	  }
	| {
			action: "confirmed" | "return-to-grilling" | "ui-failed";
			mode: "confirmation";
	  }
	| { action: "invalid-tool-input"; errors: string[] };

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
}

export interface GrillRoundCustomComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	invalidate(): void;
	focused?: boolean;
	dispose?(): void;
}

export interface GrillRoundExecutionOptions {
	decisionUiRunner?: (
		input: GrillDecisionRoundInput,
		ctx: GrillRoundToolContext,
	) => Promise<GrillDecisionRoundUiOutcome | undefined>;
	confirmationUiRunner?: (
		input: Extract<GrillRoundInput, { mode: "confirmation" }>,
		ctx: GrillRoundToolContext,
	) => Promise<GrillConfirmationUiOutcome | undefined>;
}

export type GrillRoundValidation =
	| { ok: true; input: GrillRoundInput }
	| { ok: false; errors: readonly string[] };

/** Validate the complete round atomically, including cross-field identities. */
export function validateGrillRoundInput(value: unknown): GrillRoundValidation {
	const parsed = grillRoundInputSchema.safeParse(value);
	if (!parsed.success) {
		return { ok: false, errors: parsed.error.issues.map(formatIssue) };
	}
	if (parsed.data.mode === "confirmation") {
		return { ok: true, input: parsed.data };
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
	return { ok: true, input: parsed.data };
}

function formatIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length === 0 ? "input" : issue.path.join(".");
	return `${path}: ${issue.message}`;
}

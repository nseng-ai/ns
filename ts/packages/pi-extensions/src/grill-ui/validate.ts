import type { GrillAskOption, GrillAskRemainingEstimate, NormalizedGrillAskInput } from "../grill-ui.ts";

export const RESERVED_GRILL_ASK_VALUES = new Set(["__freeform__", "__status__", "__end_grill__", "__cancelled__"]);

export type GrillAskValidationResult =
	| { ok: true; input: NormalizedGrillAskInput }
	| { ok: false; errors: string[] };

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
		estimatedRemaining: {
			description:
				"Optional honest estimate of how many grill questions remain after the current question is answered. Use unknown or a broad range when uncertain.",
			oneOf: [
				{
					type: "object",
					properties: {
						kind: { type: "string", const: "exact" },
						count: { type: "integer", minimum: 0 },
						basis: { type: "string", description: "Optional short basis for the estimate." },
					},
					required: ["kind", "count"],
					additionalProperties: false,
				},
				{
					type: "object",
					properties: {
						kind: { type: "string", const: "range" },
						min: { type: "integer", minimum: 0 },
						max: { type: "integer", minimum: 0 },
						basis: { type: "string", description: "Short basis for the range and uncertainty." },
					},
					required: ["kind", "min", "max", "basis"],
					additionalProperties: false,
				},
				{
					type: "object",
					properties: {
						kind: { type: "string", const: "unknown" },
						basis: { type: "string", description: "Short explanation of why the remaining question count is unknown." },
					},
					required: ["kind", "basis"],
					additionalProperties: false,
				},
			],
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

	const estimatedRemaining = normalizeEstimatedRemaining(params.estimatedRemaining, errors);

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
			...(estimatedRemaining === undefined ? {} : { estimatedRemaining }),
			allowFreeform: allowFreeform as boolean,
			allowEnd: allowEnd as boolean,
		},
	};
}

function normalizeEstimatedRemaining(rawValue: unknown, errors: string[]): GrillAskRemainingEstimate | undefined {
	if (rawValue === undefined) return undefined;
	if (!isRecord(rawValue)) {
		errors.push("estimatedRemaining must be an object when supplied.");
		return undefined;
	}

	const kind = rawValue.kind;
	if (kind === "exact") {
		const count = nonNegativeInteger(rawValue.count);
		if (count === undefined) {
			errors.push("estimatedRemaining.count must be a non-negative integer for exact estimates.");
		}
		const basis = optionalTrimmedString(rawValue.basis, "estimatedRemaining.basis", errors);
		return count === undefined
			? undefined
			: {
					kind: "exact",
					count,
					...(basis === undefined ? {} : { basis }),
				};
	}

	if (kind === "range") {
		const min = nonNegativeInteger(rawValue.min);
		const max = nonNegativeInteger(rawValue.max);
		if (min === undefined) errors.push("estimatedRemaining.min must be a non-negative integer for range estimates.");
		if (max === undefined) errors.push("estimatedRemaining.max must be a non-negative integer for range estimates.");
		if (min !== undefined && max !== undefined && min > max) {
			errors.push("estimatedRemaining.min must be less than or equal to estimatedRemaining.max.");
		}
		const basis = requiredTrimmedString(rawValue.basis, "estimatedRemaining.basis", errors);
		return min === undefined || max === undefined || min > max || basis === undefined
			? undefined
			: { kind: "range", min, max, basis };
	}

	if (kind === "unknown") {
		const basis = requiredTrimmedString(rawValue.basis, "estimatedRemaining.basis", errors);
		return basis === undefined ? undefined : { kind: "unknown", basis };
	}

	errors.push("estimatedRemaining.kind must be exact, range, or unknown when supplied.");
	return undefined;
}

function requiredTrimmedString(rawValue: unknown, name: string, errors: string[]): string | undefined {
	if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
		errors.push(`${name} must be a non-empty string.`);
		return undefined;
	}
	return rawValue.trim();
}

function optionalTrimmedString(rawValue: unknown, name: string, errors: string[]): string | undefined {
	if (rawValue === undefined) return undefined;
	if (typeof rawValue !== "string") {
		errors.push(`${name} must be a string when supplied.`);
		return undefined;
	}
	const trimmed = rawValue.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function nonNegativeInteger(value: unknown): number | undefined {
	if (!Number.isInteger(value) || typeof value !== "number" || value < 0) return undefined;
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

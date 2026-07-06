import { splitMarkdownFrontmatter } from "@nseng-ai/foundation/markdown-frontmatter";
import { formatErrorMessage, formatZodError, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErr, type Result } from "@nseng-ai/foundation/result";
import { parse } from "yaml";

import {
	reviewDefinitionSchema,
	type ReviewApplicability,
	type ReviewDefinition,
} from "./models.ts";

const ALLOWED_FRONTMATTER_KEYS = [
	"applies_to",
	"description",
	"local_only",
	"model_profile",
] as const;
const ALLOWED_APPLIES_TO_KEYS = ["exclude", "include"] as const;

export type ReviewDefinitionParseResult =
	| { readonly ok: true; readonly definition: ReviewDefinition }
	| { readonly ok: false; readonly error: ReviewDefinitionParseError };

export interface ReviewDefinitionParseError {
	readonly code: ReviewDefinitionParseErrorCode;
	readonly message: string;
}

export type ReviewDefinitionParseErrorCode =
	| "empty-source"
	| "missing-open-fence"
	| "missing-close-fence"
	| "invalid-yaml"
	| "invalid-frontmatter"
	| "unknown-frontmatter-key"
	| "invalid-name"
	| "invalid-description"
	| "invalid-model-profile"
	| "invalid-local-only"
	| "invalid-instructions"
	| "invalid-applicability";

interface ParseReviewDefinitionOptions {
	readonly name: string;
}

export function parseReviewDefinition(
	source: string,
	options: ParseReviewDefinitionOptions,
): ReviewDefinitionParseResult {
	const name = options.name.trim();
	if (name === "") {
		return failure("invalid-name", "Review definition `name` must be a non-empty string.");
	}

	const split = splitFrontmatter(source);
	if (!split.ok) return split;

	let parsedFrontmatter: unknown;
	try {
		parsedFrontmatter = parse(split.frontmatterText);
	} catch (error) {
		return failure(
			"invalid-yaml",
			`Review definition frontmatter is not valid YAML: ${formatErrorMessage(error)}`,
		);
	}

	if (parsedFrontmatter === null || parsedFrontmatter === undefined) {
		return failure("invalid-frontmatter", "Review definition frontmatter is empty.");
	}
	if (!isRecord(parsedFrontmatter)) {
		return failure("invalid-frontmatter", "Review definition frontmatter must be a YAML mapping.");
	}

	const unknownKeys = sortedUnknownKeys(parsedFrontmatter, ALLOWED_FRONTMATTER_KEYS);
	if (unknownKeys.length > 0) {
		const unknownList = unknownKeys.map((key) => `\`${key}\``).join(", ");
		const allowed = [...ALLOWED_FRONTMATTER_KEYS].sort().join(", ");
		return failure(
			"unknown-frontmatter-key",
			`Review definition frontmatter contains unknown field(s): ${unknownList}. Allowed fields: ${allowed}.`,
		);
	}

	const description = requireStringField(parsedFrontmatter, "description");
	if (!description.ok) return description;

	const modelProfile = parseModelProfile(parsedFrontmatter);
	if (!modelProfile.ok) return modelProfile;

	const applicability = parseApplicability(parsedFrontmatter);
	if (!applicability.ok) return applicability;

	const localOnly = parseLocalOnly(parsedFrontmatter);
	if (!localOnly.ok) return localOnly;

	const instructions = split.body.trim();
	if (instructions === "") {
		return failure(
			"invalid-instructions",
			"Review definition body (instructions) must not be empty.",
		);
	}

	const candidate = {
		name,
		description: description.value,
		instructions,
		modelProfile: modelProfile.value,
		applicability: applicability.value,
		localOnly: localOnly.value,
	};
	const parsedDefinition = reviewDefinitionSchema.safeParse(candidate);
	if (!parsedDefinition.success) {
		throw new Error(
			`Review definition parser produced a value that does not match reviewDefinitionSchema: ${formatZodError(parsedDefinition.error)}`,
		);
	}
	return { ok: true, definition: parsedDefinition.data };
}

type FrontmatterSplitResult =
	| { readonly ok: true; readonly frontmatterText: string; readonly body: string }
	| { readonly ok: false; readonly error: ReviewDefinitionParseError };

function splitFrontmatter(source: string): FrontmatterSplitResult {
	if (source.trim() === "") return failure("empty-source", "Review definition is empty.");
	const split = splitMarkdownFrontmatter(source);
	if (split.type === "not_found")
		return failure(
			"missing-open-fence",
			"Review definition must begin with a `---` frontmatter fence.",
		);
	if (split.type === "missing_closing_fence")
		return failure(
			"missing-close-fence",
			"Review definition frontmatter is missing a closing `---` fence.",
		);
	return {
		ok: true,
		frontmatterText: split.block.frontmatterText.replace(/\r\n?/gu, "\n"),
		body: split.block.body.replace(/\r\n?/gu, "\n"),
	};
}

type StringFieldResult = Result<string, ReviewDefinitionParseError>;

function requireStringField(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): StringFieldResult {
	if (!(field in frontmatter)) {
		return failure(
			"invalid-description",
			`Review definition frontmatter is missing required field \`${field}\`.`,
		);
	}
	const value = frontmatter[field];
	if (typeof value !== "string" || value.trim() === "") {
		return failure(
			"invalid-description",
			`Review definition field \`${field}\` must be a non-empty string.`,
		);
	}
	return { ok: true, value: value.trim() };
}

type ModelProfileResult = Result<string, ReviewDefinitionParseError>;

function parseModelProfile(frontmatter: Readonly<Record<string, unknown>>): ModelProfileResult {
	if (!("model_profile" in frontmatter)) return { ok: true, value: "quick" };
	const value = frontmatter.model_profile;
	if (typeof value !== "string" || value.trim() === "") {
		return failure(
			"invalid-model-profile",
			"Review definition field `model_profile` must be a non-empty string.",
		);
	}
	return { ok: true, value: value.trim() };
}

type LocalOnlyResult = Result<boolean, ReviewDefinitionParseError>;

function parseLocalOnly(frontmatter: Readonly<Record<string, unknown>>): LocalOnlyResult {
	if (!("local_only" in frontmatter)) return { ok: true, value: false };
	const value = frontmatter.local_only;
	if (typeof value !== "boolean") {
		return failure("invalid-local-only", "Review definition field `local_only` must be a boolean.");
	}
	return { ok: true, value };
}

type ApplicabilityResult = Result<ReviewApplicability, ReviewDefinitionParseError>;

function parseApplicability(frontmatter: Readonly<Record<string, unknown>>): ApplicabilityResult {
	if (!("applies_to" in frontmatter)) return { ok: true, value: { include: [], exclude: [] } };
	const value = frontmatter.applies_to;
	if (!isRecord(value)) {
		return failure(
			"invalid-applicability",
			"Review definition field `applies_to` must be a YAML mapping.",
		);
	}

	const unknownKeys = sortedUnknownKeys(value, ALLOWED_APPLIES_TO_KEYS);
	if (unknownKeys.length > 0) {
		const unknownList = unknownKeys.map((key) => `\`${key}\``).join(", ");
		return failure(
			"invalid-applicability",
			`Review definition field \`applies_to\` contains unknown field(s): ${unknownList}.`,
		);
	}

	const include = requirePatternList(value, { field: "include", shouldAllowEmpty: false });
	if (!include.ok) return include;
	const exclude =
		"exclude" in value
			? requirePatternList(value, { field: "exclude", shouldAllowEmpty: true })
			: { ok: true as const, value: [] };
	if (!exclude.ok) return exclude;
	return { ok: true, value: { include: include.value, exclude: exclude.value } };
}

interface RequirePatternListOptions {
	readonly field: "include" | "exclude";
	readonly shouldAllowEmpty: boolean;
}

type PatternListResult = Result<string[], ReviewDefinitionParseError>;

function requirePatternList(
	appliesTo: Readonly<Record<string, unknown>>,
	options: RequirePatternListOptions,
): PatternListResult {
	if (!(options.field in appliesTo)) {
		return failure(
			"invalid-applicability",
			`Review definition field \`applies_to.${options.field}\` is required.`,
		);
	}

	const value = appliesTo[options.field];
	if (!Array.isArray(value)) {
		return failure(
			"invalid-applicability",
			`Review definition field \`applies_to.${options.field}\` must be a list of strings.`,
		);
	}
	if (value.length === 0 && !options.shouldAllowEmpty) {
		return failure(
			"invalid-applicability",
			`Review definition field \`applies_to.${options.field}\` must not be empty.`,
		);
	}

	const patterns: string[] = [];
	for (const pattern of value) {
		const result = validateApplicabilityPattern(pattern, options.field);
		if (!result.ok) return result;
		patterns.push(result.value);
	}
	return { ok: true, value: patterns };
}

function validateApplicabilityPattern(
	pattern: unknown,
	field: "include" | "exclude",
): StringFieldResult {
	if (typeof pattern !== "string" || pattern.trim() === "") {
		return failure(
			"invalid-applicability",
			`Review definition field \`applies_to.${field}\` must contain non-empty strings.`,
		);
	}

	const normalized = pattern.trim().replaceAll("\\", "/");
	if (normalized.startsWith(":(")) {
		return failure(
			"invalid-applicability",
			"Review definition applicability patterns must be globs, not git pathspecs.",
		);
	}
	if (normalized.startsWith("/")) {
		return failure(
			"invalid-applicability",
			"Review definition applicability patterns must be repo-relative.",
		);
	}
	if (normalized.split("/").includes("..")) {
		return failure(
			"invalid-applicability",
			"Review definition applicability patterns must not contain `..` segments.",
		);
	}
	return { ok: true, value: normalized };
}

type ReviewDefinitionFailureResult = Extract<
	Result<never, ReviewDefinitionParseError>,
	{ readonly ok: false }
>;

function failure(
	code: ReviewDefinitionParseErrorCode,
	message: string,
): ReviewDefinitionFailureResult {
	const result = resultErr<never, ReviewDefinitionParseError>({ code, message });
	if (!result.ok) return result;
	throw new Error("unreachable resultErr success");
}

function sortedUnknownKeys(
	record: Readonly<Record<string, unknown>>,
	allowedKeys: readonly string[],
): string[] {
	return Object.keys(record)
		.filter((key) => !allowedKeys.includes(key))
		.sort();
}

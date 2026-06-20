import { splitMarkdownFrontmatter } from "@asdl/core/markdown-frontmatter";
import { formatErrorMessage, formatZodError, isRecord } from "@asdl/core/primitives";
import { parse } from "yaml";

import {
	reviewDefinitionSchema,
	type ReviewApplicability,
	type ReviewDefinition,
} from "./models.ts";

const ALLOWED_FRONTMATTER_KEYS = ["applies_to", "default_model", "description"] as const;
const ALLOWED_APPLIES_TO_KEYS = ["exclude", "include"] as const;

export type ReviewDefinitionParseResult =
	| { readonly type: "ok"; readonly definition: ReviewDefinition }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

export interface ReviewDefinitionParseError {
	readonly code: ReviewDefinitionParseErrorCode;
	readonly message: string;
}

export type ReviewDefinitionParseErrorCode =
	| "empty_source"
	| "missing_open_fence"
	| "missing_close_fence"
	| "invalid_yaml"
	| "invalid_frontmatter"
	| "unknown_frontmatter_key"
	| "invalid_name"
	| "invalid_description"
	| "invalid_default_model"
	| "invalid_instructions"
	| "invalid_applicability";

interface ParseReviewDefinitionOptions {
	readonly name: string;
}

export function parseReviewDefinition(
	source: string,
	options: ParseReviewDefinitionOptions,
): ReviewDefinitionParseResult {
	const name = options.name.trim();
	if (name === "") {
		return failure("invalid_name", "Review definition `name` must be a non-empty string.");
	}

	const split = splitFrontmatter(source);
	if (split.type === "error") return split;

	let parsedFrontmatter: unknown;
	try {
		parsedFrontmatter = parse(split.frontmatterText);
	} catch (error) {
		return failure(
			"invalid_yaml",
			`Review definition frontmatter is not valid YAML: ${formatErrorMessage(error)}`,
		);
	}

	if (parsedFrontmatter === null || parsedFrontmatter === undefined) {
		return failure("invalid_frontmatter", "Review definition frontmatter is empty.");
	}
	if (!isRecord(parsedFrontmatter)) {
		return failure("invalid_frontmatter", "Review definition frontmatter must be a YAML mapping.");
	}

	const unknownKeys = sortedUnknownKeys(parsedFrontmatter, ALLOWED_FRONTMATTER_KEYS);
	if (unknownKeys.length > 0) {
		const unknownList = unknownKeys.map((key) => `\`${key}\``).join(", ");
		const allowed = [...ALLOWED_FRONTMATTER_KEYS].sort().join(", ");
		return failure(
			"unknown_frontmatter_key",
			`Review definition frontmatter contains unknown field(s): ${unknownList}. Allowed fields: ${allowed}.`,
		);
	}

	const description = requireStringField(parsedFrontmatter, "description");
	if (description.type === "error") return description;

	const defaultModel = parseDefaultModel(parsedFrontmatter);
	if (defaultModel.type === "error") return defaultModel;

	const applicability = parseApplicability(parsedFrontmatter);
	if (applicability.type === "error") return applicability;

	const instructions = split.body.trim();
	if (instructions === "") {
		return failure(
			"invalid_instructions",
			"Review definition body (instructions) must not be empty.",
		);
	}

	const candidate = {
		name,
		description: description.value,
		instructions,
		defaultModel: defaultModel.value,
		applicability: applicability.value,
	};
	const parsedDefinition = reviewDefinitionSchema.safeParse(candidate);
	if (!parsedDefinition.success) {
		throw new Error(
			`Review definition parser produced a value that does not match reviewDefinitionSchema: ${formatZodError(parsedDefinition.error)}`,
		);
	}
	return { type: "ok", definition: parsedDefinition.data };
}

type FrontmatterSplitResult =
	| { readonly type: "ok"; readonly frontmatterText: string; readonly body: string }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

function splitFrontmatter(source: string): FrontmatterSplitResult {
	if (source.trim() === "") return failure("empty_source", "Review definition is empty.");
	const split = splitMarkdownFrontmatter(source);
	if (split.type === "not_found")
		return failure(
			"missing_open_fence",
			"Review definition must begin with a `---` frontmatter fence.",
		);
	if (split.type === "missing_closing_fence")
		return failure(
			"missing_close_fence",
			"Review definition frontmatter is missing a closing `---` fence.",
		);
	return {
		type: "ok",
		frontmatterText: split.block.frontmatterText.replace(/\r\n?/gu, "\n"),
		body: split.block.body.replace(/\r\n?/gu, "\n"),
	};
}

type StringFieldResult =
	| { readonly type: "ok"; readonly value: string }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

function requireStringField(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): StringFieldResult {
	if (!(field in frontmatter)) {
		return failure(
			"invalid_description",
			`Review definition frontmatter is missing required field \`${field}\`.`,
		);
	}
	const value = frontmatter[field];
	if (typeof value !== "string" || value.trim() === "") {
		return failure(
			"invalid_description",
			`Review definition field \`${field}\` must be a non-empty string.`,
		);
	}
	return { type: "ok", value: value.trim() };
}

type DefaultModelResult =
	| { readonly type: "ok"; readonly value: string | null }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

function parseDefaultModel(frontmatter: Readonly<Record<string, unknown>>): DefaultModelResult {
	if (!("default_model" in frontmatter)) return { type: "ok", value: null };
	const value = frontmatter.default_model;
	if (typeof value !== "string" || value.trim() === "") {
		return failure(
			"invalid_default_model",
			"Review definition field `default_model` must be a non-empty string.",
		);
	}
	return { type: "ok", value: value.trim() };
}

type ApplicabilityResult =
	| { readonly type: "ok"; readonly value: ReviewApplicability }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

function parseApplicability(frontmatter: Readonly<Record<string, unknown>>): ApplicabilityResult {
	if (!("applies_to" in frontmatter)) return { type: "ok", value: { include: [], exclude: [] } };
	const value = frontmatter.applies_to;
	if (!isRecord(value)) {
		return failure(
			"invalid_applicability",
			"Review definition field `applies_to` must be a YAML mapping.",
		);
	}

	const unknownKeys = sortedUnknownKeys(value, ALLOWED_APPLIES_TO_KEYS);
	if (unknownKeys.length > 0) {
		const unknownList = unknownKeys.map((key) => `\`${key}\``).join(", ");
		return failure(
			"invalid_applicability",
			`Review definition field \`applies_to\` contains unknown field(s): ${unknownList}.`,
		);
	}

	const include = requirePatternList(value, { field: "include", shouldAllowEmpty: false });
	if (include.type === "error") return include;
	const exclude =
		"exclude" in value
			? requirePatternList(value, { field: "exclude", shouldAllowEmpty: true })
			: { type: "ok" as const, value: [] };
	if (exclude.type === "error") return exclude;
	return { type: "ok", value: { include: include.value, exclude: exclude.value } };
}

interface RequirePatternListOptions {
	readonly field: "include" | "exclude";
	readonly shouldAllowEmpty: boolean;
}

type PatternListResult =
	| { readonly type: "ok"; readonly value: string[] }
	| { readonly type: "error"; readonly error: ReviewDefinitionParseError };

function requirePatternList(
	appliesTo: Readonly<Record<string, unknown>>,
	options: RequirePatternListOptions,
): PatternListResult {
	if (!(options.field in appliesTo)) {
		return failure(
			"invalid_applicability",
			`Review definition field \`applies_to.${options.field}\` is required.`,
		);
	}

	const value = appliesTo[options.field];
	if (!Array.isArray(value)) {
		return failure(
			"invalid_applicability",
			`Review definition field \`applies_to.${options.field}\` must be a list of strings.`,
		);
	}
	if (value.length === 0 && !options.shouldAllowEmpty) {
		return failure(
			"invalid_applicability",
			`Review definition field \`applies_to.${options.field}\` must not be empty.`,
		);
	}

	const patterns: string[] = [];
	for (const pattern of value) {
		const result = validateApplicabilityPattern(pattern, options.field);
		if (result.type === "error") return result;
		patterns.push(result.value);
	}
	return { type: "ok", value: patterns };
}

function validateApplicabilityPattern(
	pattern: unknown,
	field: "include" | "exclude",
): StringFieldResult {
	if (typeof pattern !== "string" || pattern.trim() === "") {
		return failure(
			"invalid_applicability",
			`Review definition field \`applies_to.${field}\` must contain non-empty strings.`,
		);
	}

	const normalized = pattern.trim().replaceAll("\\", "/");
	if (normalized.startsWith(":(")) {
		return failure(
			"invalid_applicability",
			"Review definition applicability patterns must be globs, not git pathspecs.",
		);
	}
	if (normalized.startsWith("/")) {
		return failure(
			"invalid_applicability",
			"Review definition applicability patterns must be repo-relative.",
		);
	}
	if (normalized.split("/").includes("..")) {
		return failure(
			"invalid_applicability",
			"Review definition applicability patterns must not contain `..` segments.",
		);
	}
	return { type: "ok", value: normalized };
}

function failure(
	code: ReviewDefinitionParseErrorCode,
	message: string,
): { readonly type: "error"; readonly error: ReviewDefinitionParseError } {
	return { type: "error", error: { code, message } };
}

function sortedUnknownKeys(
	record: Readonly<Record<string, unknown>>,
	allowedKeys: readonly string[],
): string[] {
	return Object.keys(record)
		.filter((key) => !allowedKeys.includes(key))
		.sort();
}

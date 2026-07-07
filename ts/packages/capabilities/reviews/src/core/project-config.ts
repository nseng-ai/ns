import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/kernel/project-config/points";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

export interface ReviewsDiffProjectConfig {
	readonly exclude: readonly string[];
}

export interface ReviewsModelProfilesProjectConfig {
	readonly quick: string;
	readonly deep: string;
}

export interface ReviewsProjectConfig {
	readonly diff: ReviewsDiffProjectConfig;
	readonly modelProfiles: ReviewsModelProfilesProjectConfig;
}

export type ProjectConfigParseResult = Result<ReviewsProjectConfig, ProjectConfigError>;

export interface ProjectConfigError {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
}

export type ProjectConfigErrorCode =
	| "invalid-toml"
	| "invalid-table"
	| "invalid-exclude"
	| "invalid-model-profiles";

export interface GitDiffArgsOptions {
	readonly baseRef: string;
	readonly excludeGlobs?: readonly string[];
}

export const DEFAULT_REVIEWS_MODEL_PROFILES: ReviewsModelProfilesProjectConfig = {
	quick: "haiku",
	deep: "sonnet",
};

const EMPTY_CONFIG: ReviewsProjectConfig = {
	diff: { exclude: [] },
	modelProfiles: DEFAULT_REVIEWS_MODEL_PROFILES,
};
const MODEL_PROFILE_KEYS = ["quick", "deep"] as const;
export type ReviewsModelProfileKey = (typeof MODEL_PROFILE_KEYS)[number];

type ReviewsSettingsRecord = Record<string, unknown>;

const recordSchema = z.record(z.string(), z.unknown());

const reviewsRootSettingsSchema = {
	path: ["reviews"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) => formatMessage("[reviews] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<ReviewsSettingsRecord>;

const reviewsDiffSettingsSchema = {
	path: ["reviews", "diff"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) =>
		formatMessage("[reviews.diff] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<ReviewsSettingsRecord>;

const reviewsModelProfilesSettingsSchema = {
	path: ["reviews", "model_profiles"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) =>
		formatMessage("[reviews.model_profiles] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<ReviewsSettingsRecord>;

const reviewsRootSettingsKey = reviewsRootSettingsSchema.path.join(".");
const reviewsDiffSettingsKey = reviewsDiffSettingsSchema.path.join(".");
const reviewsModelProfilesSettingsKey = reviewsModelProfilesSettingsSchema.path.join(".");

const SETTINGS_TABLE_ERROR_CODES = {
	[reviewsRootSettingsKey]: "invalid-table",
	[reviewsDiffSettingsKey]: "invalid-table",
	[reviewsModelProfilesSettingsKey]: "invalid-table",
} as const;

export function parseReviewsProjectConfigToml(
	source: string,
	pathLabel?: string,
): ProjectConfigParseResult {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		pointsTable: { mode: "skip" },
		settingsSchemas: [
			reviewsRootSettingsSchema,
			reviewsDiffSettingsSchema,
			reviewsModelProfilesSettingsSchema,
		],
	});
	if (!result.ok) return projectConfigParseErrorFromDiagnostics(result.diagnostics, pathLabel);

	const diffSettings = getProjectConfigSetting(result.config, reviewsDiffSettingsSchema);
	const parsedDiff = parseDiffConfig(diffSettings, pathLabel);
	if (!parsedDiff.ok) return parsedDiff;

	const modelProfileSettings = getProjectConfigSetting(
		result.config,
		reviewsModelProfilesSettingsSchema,
	);
	const parsedModelProfiles = parseModelProfiles(modelProfileSettings, pathLabel);
	if (!parsedModelProfiles.ok) return parsedModelProfiles;

	return {
		ok: true,
		value: { diff: parsedDiff.value, modelProfiles: parsedModelProfiles.value },
	};
}

export function reviewsExcludeGlobsToGitPathspecs(patterns: readonly string[]): readonly string[] {
	return patterns.map((pattern) => `:(exclude,glob)${pattern}`);
}

export function buildGitDiffArgs(options: GitDiffArgsOptions): readonly string[] {
	const args = [
		"-c",
		"diff.noprefix=false",
		"-c",
		"diff.mnemonicPrefix=false",
		"-c",
		"diff.srcPrefix=a/",
		"-c",
		"diff.dstPrefix=b/",
		"diff",
		"--no-ext-diff",
		`origin/${options.baseRef}...HEAD`,
	];
	const excludeGlobs = options.excludeGlobs ?? [];
	if (excludeGlobs.length === 0) return args;
	args.push("--", ".", ...reviewsExcludeGlobsToGitPathspecs(excludeGlobs));
	return args;
}

type DiffConfigParseResult = Result<ReviewsDiffProjectConfig, ProjectConfigError>;

type ExcludeParseResult = Result<readonly string[], ProjectConfigError>;

type ModelProfilesParseResult = Result<ReviewsModelProfilesProjectConfig, ProjectConfigError>;

export function isReviewsModelProfileKey(value: string): value is ReviewsModelProfileKey {
	return MODEL_PROFILE_KEYS.includes(value as ReviewsModelProfileKey);
}

function parseDiffConfig(
	value: ReviewsSettingsRecord | undefined,
	pathLabel: string | undefined,
): DiffConfigParseResult {
	if (value === undefined) return { ok: true, value: EMPTY_CONFIG.diff };

	const exclude = value.exclude;
	if (exclude === undefined) return { ok: true, value: EMPTY_CONFIG.diff };
	const parsedExclude = parseExcludeGlobs(exclude, pathLabel);
	if (!parsedExclude.ok) return parsedExclude;
	return { ok: true, value: { exclude: parsedExclude.value } };
}

function parseModelProfiles(
	settings: ReviewsSettingsRecord | undefined,
	pathLabel: string | undefined,
): ModelProfilesParseResult {
	if (settings === undefined) return { ok: true, value: DEFAULT_REVIEWS_MODEL_PROFILES };

	const unknownKeys = Object.keys(settings)
		.filter((key) => !isReviewsModelProfileKey(key))
		.sort();
	if (unknownKeys.length > 0) {
		return resultErrOf(
			"invalid-model-profiles",
			formatMessage(
				`[reviews.model_profiles] contains unknown profile key(s): ${unknownKeys.join(", ")}. Allowed keys: ${MODEL_PROFILE_KEYS.join(", ")}.`,
				pathLabel,
			),
		);
	}

	const profiles = { ...DEFAULT_REVIEWS_MODEL_PROFILES };
	for (const key of MODEL_PROFILE_KEYS) {
		if (!(key in settings)) continue;
		const profileValue = settings[key];
		if (typeof profileValue !== "string" || profileValue.trim() === "") {
			return resultErrOf(
				"invalid-model-profiles",
				formatMessage(`[reviews.model_profiles].${key} must be a non-empty string.`, pathLabel),
			);
		}
		profiles[key] = profileValue.trim();
	}
	return { ok: true, value: profiles };
}

function parseExcludeGlobs(value: unknown, pathLabel: string | undefined): ExcludeParseResult {
	if (!Array.isArray(value)) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage("[reviews.diff].exclude must be a TOML array of non-empty strings.", pathLabel),
		);
	}

	const patterns: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim() === "") {
			return resultErrOf(
				"invalid-exclude",
				formatMessage("[reviews.diff].exclude must contain only non-empty strings.", pathLabel),
			);
		}
		const validation = validateReviewsExcludePattern(item, pathLabel);
		if (!validation.ok) return validation;
		patterns.push(item);
	}
	return { ok: true, value: patterns };
}

function validateReviewsExcludePattern(
	pattern: string,
	pathLabel: string | undefined,
): Result<void, ProjectConfigError> {
	if (pattern.startsWith(":(")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage(
				"[reviews.diff].exclude entries must be plain glob patterns, not raw Git pathspecs.",
				pathLabel,
			),
		);
	}
	if (pattern.startsWith("/")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage("[reviews.diff].exclude entries must be repo-relative patterns.", pathLabel),
		);
	}
	if (pattern.split("/").includes("..")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage(
				"[reviews.diff].exclude entries must not contain '..' path segments.",
				pathLabel,
			),
		);
	}
	return { ok: true, value: undefined };
}

function projectConfigParseErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string | undefined,
): ProjectConfigParseResult {
	const error = projectConfigErrorFromDiagnostics(diagnostics, {
		invalidToml: "invalid-toml",
		invalidSettingsByPath: SETTINGS_TABLE_ERROR_CODES,
		defaultCode: "invalid-table",
		defaultMessage: formatMessage("invalid ns.toml", pathLabel),
		...(pathLabel === undefined ? {} : { pathLabel }),
	});
	return resultErrOf(error.code, error.message);
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import { parse } from "smol-toml";

export interface RoasterDiffProjectConfig {
	readonly exclude: readonly string[];
}

export interface RoasterModelProfilesProjectConfig {
	readonly quick: string;
	readonly deep: string;
}

export interface RoasterProjectConfig {
	readonly diff: RoasterDiffProjectConfig;
	readonly modelProfiles: RoasterModelProfilesProjectConfig;
}

export type ProjectConfigParseResult = Result<RoasterProjectConfig, ProjectConfigError>;

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

export const DEFAULT_ROASTER_MODEL_PROFILES: RoasterModelProfilesProjectConfig = {
	quick: "haiku",
	deep: "sonnet",
};

const EMPTY_CONFIG: RoasterProjectConfig = {
	diff: { exclude: [] },
	modelProfiles: DEFAULT_ROASTER_MODEL_PROFILES,
};
const MODEL_PROFILE_KEYS = ["quick", "deep"] as const;
export type RoasterModelProfileKey = (typeof MODEL_PROFILE_KEYS)[number];

export function parseRoasterProjectConfigToml(
	source: string,
	pathLabel?: string,
): ProjectConfigParseResult {
	let data: unknown;
	try {
		data = parse(source);
	} catch (error) {
		return resultErrOf(
			"invalid-toml",
			formatMessage(`Invalid TOML: ${formatErrorMessage(error)}`, pathLabel),
		);
	}

	if (!isRecord(data)) return { ok: true, value: EMPTY_CONFIG };
	const roaster = data.roaster;
	if (roaster === undefined) return { ok: true, value: EMPTY_CONFIG };
	if (!isRecord(roaster))
		return resultErrOf(
			"invalid-table",
			formatMessage("[roaster] must be a TOML table.", pathLabel),
		);

	const parsedDiff = parseDiffConfig(roaster.diff, pathLabel);
	if (!parsedDiff.ok) return parsedDiff;

	const parsedModelProfiles = parseModelProfiles(roaster.model_profiles, pathLabel);
	if (!parsedModelProfiles.ok) return parsedModelProfiles;

	return {
		ok: true,
		value: { diff: parsedDiff.value, modelProfiles: parsedModelProfiles.value },
	};
}

export function roasterExcludeGlobsToGitPathspecs(patterns: readonly string[]): readonly string[] {
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
	args.push("--", ".", ...roasterExcludeGlobsToGitPathspecs(excludeGlobs));
	return args;
}

type DiffConfigParseResult = Result<RoasterDiffProjectConfig, ProjectConfigError>;

type ExcludeParseResult = Result<readonly string[], ProjectConfigError>;

type ModelProfilesParseResult = Result<RoasterModelProfilesProjectConfig, ProjectConfigError>;

export function isRoasterModelProfileKey(value: string): value is RoasterModelProfileKey {
	return MODEL_PROFILE_KEYS.includes(value as RoasterModelProfileKey);
}

function parseDiffConfig(value: unknown, pathLabel: string | undefined): DiffConfigParseResult {
	if (value === undefined) return { ok: true, value: EMPTY_CONFIG.diff };
	if (!isRecord(value)) {
		return resultErrOf(
			"invalid-table",
			formatMessage("[roaster.diff] must be a TOML table.", pathLabel),
		);
	}

	const exclude = value.exclude;
	if (exclude === undefined) return { ok: true, value: EMPTY_CONFIG.diff };
	const parsedExclude = parseExcludeGlobs(exclude, pathLabel);
	if (!parsedExclude.ok) return parsedExclude;
	return { ok: true, value: { exclude: parsedExclude.value } };
}

function parseModelProfiles(
	value: unknown,
	pathLabel: string | undefined,
): ModelProfilesParseResult {
	if (value === undefined) return { ok: true, value: DEFAULT_ROASTER_MODEL_PROFILES };
	if (!isRecord(value)) {
		return resultErrOf(
			"invalid-table",
			formatMessage("[roaster.model_profiles] must be a TOML table.", pathLabel),
		);
	}

	const unknownKeys = Object.keys(value)
		.filter((key) => !isRoasterModelProfileKey(key))
		.sort();
	if (unknownKeys.length > 0) {
		return resultErrOf(
			"invalid-model-profiles",
			formatMessage(
				`[roaster.model_profiles] contains unknown profile key(s): ${unknownKeys.join(", ")}. Allowed keys: ${MODEL_PROFILE_KEYS.join(", ")}.`,
				pathLabel,
			),
		);
	}

	const profiles = { ...DEFAULT_ROASTER_MODEL_PROFILES };
	for (const key of MODEL_PROFILE_KEYS) {
		if (!(key in value)) continue;
		const profileValue = value[key];
		if (typeof profileValue !== "string" || profileValue.trim() === "") {
			return resultErrOf(
				"invalid-model-profiles",
				formatMessage(`[roaster.model_profiles].${key} must be a non-empty string.`, pathLabel),
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
			formatMessage("[roaster.diff].exclude must be a TOML array of non-empty strings.", pathLabel),
		);
	}

	const patterns: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim() === "") {
			return resultErrOf(
				"invalid-exclude",
				formatMessage("[roaster.diff].exclude must contain only non-empty strings.", pathLabel),
			);
		}
		const validation = validateRoasterExcludePattern(item, pathLabel);
		if (!validation.ok) return validation;
		patterns.push(item);
	}
	return { ok: true, value: patterns };
}

function validateRoasterExcludePattern(
	pattern: string,
	pathLabel: string | undefined,
): Result<void, ProjectConfigError> {
	if (pattern.startsWith(":(")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage(
				"[roaster.diff].exclude entries must be plain glob patterns, not raw Git pathspecs.",
				pathLabel,
			),
		);
	}
	if (pattern.startsWith("/")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage("[roaster.diff].exclude entries must be repo-relative patterns.", pathLabel),
		);
	}
	if (pattern.split("/").includes("..")) {
		return resultErrOf(
			"invalid-exclude",
			formatMessage(
				"[roaster.diff].exclude entries must not contain '..' path segments.",
				pathLabel,
			),
		);
	}
	return { ok: true, value: undefined };
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

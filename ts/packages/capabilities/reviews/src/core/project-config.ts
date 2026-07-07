import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	primaryProjectConfigDiagnostic,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/kernel/project-config/points";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

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

type RoasterSettingsRecord = Record<string, unknown>;

const recordSchema = z.record(z.string(), z.unknown());

const roasterRootSettingsSchema = {
	path: ["roaster"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) => formatMessage("[roaster] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<RoasterSettingsRecord>;

const roasterDiffSettingsSchema = {
	path: ["roaster", "diff"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) =>
		formatMessage("[roaster.diff] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<RoasterSettingsRecord>;

const roasterModelProfilesSettingsSchema = {
	path: ["roaster", "model_profiles"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) =>
		formatMessage("[roaster.model_profiles] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<RoasterSettingsRecord>;

const SETTINGS_TABLE_PATHS = new Set(["roaster", "roaster.diff", "roaster.model_profiles"]);

export function parseRoasterProjectConfigToml(
	source: string,
	pathLabel?: string,
): ProjectConfigParseResult {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		settingsSchemas: [
			roasterRootSettingsSchema,
			roasterDiffSettingsSchema,
			roasterModelProfilesSettingsSchema,
		],
	});
	if (!result.ok) return projectConfigErrorFromDiagnostics(result.diagnostics, pathLabel);

	const diffSettings = getProjectConfigSetting(result.config, roasterDiffSettingsSchema);
	const parsedDiff = parseDiffConfig(diffSettings, pathLabel);
	if (!parsedDiff.ok) return parsedDiff;

	const modelProfileSettings = getProjectConfigSetting(
		result.config,
		roasterModelProfilesSettingsSchema,
	);
	const parsedModelProfiles = parseModelProfiles(modelProfileSettings, pathLabel);
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

function parseDiffConfig(
	value: RoasterSettingsRecord | undefined,
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
	settings: RoasterSettingsRecord | undefined,
	pathLabel: string | undefined,
): ModelProfilesParseResult {
	if (settings === undefined) return { ok: true, value: DEFAULT_ROASTER_MODEL_PROFILES };

	const unknownKeys = Object.keys(settings)
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
		if (!(key in settings)) continue;
		const profileValue = settings[key];
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

function projectConfigErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string | undefined,
): ProjectConfigParseResult {
	const diagnostic = primaryProjectConfigDiagnostic(diagnostics);
	if (diagnostic?.code === "ns_toml_invalid") {
		return resultErrOf("invalid-toml", formatNsTomlInvalidMessage(diagnostic, pathLabel));
	}
	if (
		diagnostic?.code === "settings_table_invalid" &&
		diagnostic.path !== undefined &&
		SETTINGS_TABLE_PATHS.has(diagnostic.path)
	) {
		return resultErrOf("invalid-table", diagnostic.message);
	}
	return resultErrOf(
		"invalid-table",
		diagnostic?.message ?? formatMessage("invalid ns.toml", pathLabel),
	);
}

function formatNsTomlInvalidMessage(
	diagnostic: ProjectConfigDiagnostic,
	pathLabel: string | undefined,
): string {
	if (pathLabel !== undefined) return diagnostic.message;
	if (diagnostic.causeMessage !== undefined) return `Invalid TOML.\n${diagnostic.causeMessage}`;
	return diagnostic.message;
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

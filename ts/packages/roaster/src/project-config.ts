import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatErrorMessage, isRecord } from "@sdl/core/primitives";
import type { GitGateway } from "@sdl/core/git";
import { parse } from "smol-toml";

import type { LocalDiffFailure, RoasterResult } from "./failures.ts";
import type { ReviewModelProfile } from "./models.ts";

export interface RoasterDiffProjectConfig {
	readonly exclude: readonly string[];
}

export type RoasterModelProfiles = Readonly<Record<ReviewModelProfile, string>>;

export interface RoasterProjectConfig {
	readonly diff: RoasterDiffProjectConfig;
	readonly modelProfiles: RoasterModelProfiles;
}

export type ProjectConfigParseResult =
	| { readonly type: "ok"; readonly config: RoasterProjectConfig }
	| { readonly type: "error"; readonly error: ProjectConfigError };

export interface ProjectConfigError {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
}

export type ProjectConfigErrorCode =
	| "invalid_toml"
	| "invalid_table"
	| "invalid_exclude"
	| "invalid_model_profiles";

export interface GitDiffArgsOptions {
	readonly baseRef: string;
	readonly excludeGlobs?: readonly string[] | undefined;
}

export interface LoadRoasterProjectConfigOptions {
	readonly cwd: string;
	readonly signal?: AbortSignal | undefined;
	readonly gitGateway: GitGateway;
}

export const DEFAULT_ROASTER_MODEL_PROFILES = {
	quick: "haiku",
	deep: "opus",
} as const satisfies RoasterModelProfiles;

const MODEL_PROFILE_KEYS = ["quick", "deep"] as const satisfies readonly ReviewModelProfile[];

export async function loadRoasterProjectConfig(
	options: LoadRoasterProjectConfigOptions,
): Promise<RoasterResult<RoasterProjectConfig>> {
	const repoRoot = await options.gitGateway.repoRoot({ cwd: options.cwd, signal: options.signal });
	if (!repoRoot.ok) {
		return roasterError({ type: "repo_root_unavailable", message: repoRoot.error.message });
	}

	const path = join(repoRoot.value, "sdl.toml");
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (caught) {
		if (isMissingFileError(caught)) return { type: "ok", value: emptyConfig() };
		return roasterError({
			type: "project_config_invalid",
			message: `Failed to read sdl.toml: ${formatErrorMessage(caught)}`,
		});
	}

	const config = parseRoasterProjectConfigToml(source, path);
	if (config.type === "error") {
		return roasterError({ type: "project_config_invalid", message: config.error.message });
	}
	return { type: "ok", value: config.config };
}

export function parseRoasterProjectConfigToml(
	source: string,
	pathLabel?: string,
): ProjectConfigParseResult {
	let data: unknown;
	try {
		data = parse(source);
	} catch (error) {
		return failure(
			"invalid_toml",
			formatMessage(`Invalid TOML: ${formatErrorMessage(error)}`, pathLabel),
		);
	}

	if (!isRecord(data)) return { type: "ok", config: emptyConfig() };
	const roaster = data.roaster;
	if (roaster === undefined) return { type: "ok", config: emptyConfig() };
	if (!isRecord(roaster))
		return failure("invalid_table", formatMessage("[roaster] must be a TOML table.", pathLabel));

	const diff = parseDiffConfig(roaster, pathLabel);
	if (diff.type === "error") return diff;
	const modelProfiles = parseModelProfilesConfig(roaster, pathLabel);
	if (modelProfiles.type === "error") return modelProfiles;

	return {
		type: "ok",
		config: {
			diff: { exclude: diff.value },
			modelProfiles: modelProfiles.value,
		},
	};
}

export function resolveModelProfile(
	config: RoasterProjectConfig,
	profile: ReviewModelProfile,
): string {
	return config.modelProfiles[profile];
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

type DiffConfigParseResult =
	| { readonly type: "ok"; readonly value: readonly string[] }
	| { readonly type: "error"; readonly error: ProjectConfigError };

function parseDiffConfig(
	roaster: Readonly<Record<string, unknown>>,
	pathLabel: string | undefined,
): DiffConfigParseResult {
	const diff = roaster.diff;
	if (diff === undefined) return { type: "ok", value: [] };
	if (!isRecord(diff)) {
		return failure(
			"invalid_table",
			formatMessage("[roaster.diff] must be a TOML table.", pathLabel),
		);
	}

	const exclude = diff.exclude;
	if (exclude === undefined) return { type: "ok", value: [] };
	return parseExcludeGlobs(exclude, pathLabel);
}

type ModelProfilesParseResult =
	| { readonly type: "ok"; readonly value: RoasterModelProfiles }
	| { readonly type: "error"; readonly error: ProjectConfigError };

function parseModelProfilesConfig(
	roaster: Readonly<Record<string, unknown>>,
	pathLabel: string | undefined,
): ModelProfilesParseResult {
	const table = roaster.model_profiles;
	if (table === undefined) return { type: "ok", value: defaultProfiles() };
	if (!isRecord(table)) {
		return failure(
			"invalid_table",
			formatMessage("[roaster.model_profiles] must be a TOML table.", pathLabel),
		);
	}

	const unknownKeys = Object.keys(table)
		.filter((key) => !MODEL_PROFILE_KEYS.includes(key as ReviewModelProfile))
		.sort();
	if (unknownKeys.length > 0) {
		const unknownList = unknownKeys.map((key) => `\`${key}\``).join(", ");
		return failure(
			"invalid_model_profiles",
			formatMessage(
				`[roaster.model_profiles] contains unknown profile key(s): ${unknownList}. Allowed keys: quick, deep.`,
				pathLabel,
			),
		);
	}

	const profiles: Record<ReviewModelProfile, string> = { ...DEFAULT_ROASTER_MODEL_PROFILES };
	for (const key of MODEL_PROFILE_KEYS) {
		if (!(key in table)) continue;
		const value = table[key];
		if (typeof value !== "string" || value.trim() === "") {
			return failure(
				"invalid_model_profiles",
				formatMessage(`[roaster.model_profiles].${key} must be a non-empty string.`, pathLabel),
			);
		}
		profiles[key] = value.trim();
	}
	return { type: "ok", value: profiles };
}

type ExcludeParseResult =
	| { readonly type: "ok"; readonly value: readonly string[] }
	| { readonly type: "error"; readonly error: ProjectConfigError };

function parseExcludeGlobs(value: unknown, pathLabel: string | undefined): ExcludeParseResult {
	if (!Array.isArray(value)) {
		return failure(
			"invalid_exclude",
			formatMessage("[roaster.diff].exclude must be a TOML array of non-empty strings.", pathLabel),
		);
	}

	const patterns: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim() === "") {
			return failure(
				"invalid_exclude",
				formatMessage("[roaster.diff].exclude must contain only non-empty strings.", pathLabel),
			);
		}
		const validation = validateRoasterExcludePattern(item, pathLabel);
		if (validation.type === "error") return validation;
		patterns.push(item);
	}
	return { type: "ok", value: patterns };
}

function validateRoasterExcludePattern(
	pattern: string,
	pathLabel: string | undefined,
): { readonly type: "ok" } | { readonly type: "error"; readonly error: ProjectConfigError } {
	if (pattern.startsWith(":(")) {
		return failure(
			"invalid_exclude",
			formatMessage(
				"[roaster.diff].exclude entries must be plain glob patterns, not raw Git pathspecs.",
				pathLabel,
			),
		);
	}
	if (pattern.startsWith("/")) {
		return failure(
			"invalid_exclude",
			formatMessage("[roaster.diff].exclude entries must be repo-relative patterns.", pathLabel),
		);
	}
	if (pattern.split("/").includes("..")) {
		return failure(
			"invalid_exclude",
			formatMessage(
				"[roaster.diff].exclude entries must not contain '..' path segments.",
				pathLabel,
			),
		);
	}
	return { type: "ok" };
}

function emptyConfig(): RoasterProjectConfig {
	return { diff: { exclude: [] }, modelProfiles: defaultProfiles() };
}

function defaultProfiles(): RoasterModelProfiles {
	return { ...DEFAULT_ROASTER_MODEL_PROFILES };
}

function isMissingFileError(error: unknown): boolean {
	return isRecord(error) && error["code"] === "ENOENT";
}

function roasterError(errorValue: LocalDiffFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
}

function failure(
	code: ProjectConfigErrorCode,
	message: string,
): { readonly type: "error"; readonly error: ProjectConfigError } {
	return { type: "error", error: { code, message } };
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

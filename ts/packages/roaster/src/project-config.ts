import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { parse as parseToml } from "smol-toml";

export interface RoasterDiffProjectConfig {
	readonly exclude: readonly string[];
}

export interface RoasterProjectConfig {
	readonly diff: RoasterDiffProjectConfig;
}

export type ProjectConfigParseResult =
	| { readonly type: "ok"; readonly config: RoasterProjectConfig }
	| { readonly type: "error"; readonly error: ProjectConfigError };

export interface ProjectConfigError {
	readonly code: ProjectConfigErrorCode;
	readonly message: string;
}

export type ProjectConfigErrorCode = "invalid_toml" | "invalid_table" | "invalid_exclude";

export interface GitDiffArgsOptions {
	readonly baseRef: string;
	readonly excludeGlobs?: readonly string[] | undefined;
}

const EMPTY_CONFIG: RoasterProjectConfig = { diff: { exclude: [] } };

export function parseRoasterProjectConfigToml(source: string, pathLabel?: string): ProjectConfigParseResult {
	let data: unknown;
	try {
		data = parseToml(source);
	} catch (error) {
		return failure("invalid_toml", formatMessage(`Invalid TOML: ${formatErrorMessage(error)}`, pathLabel));
	}

	if (!isRecord(data)) return { type: "ok", config: EMPTY_CONFIG };
	const roaster = data.roaster;
	if (roaster === undefined) return { type: "ok", config: EMPTY_CONFIG };
	if (!isRecord(roaster)) return failure("invalid_table", formatMessage("[roaster] must be a TOML table.", pathLabel));

	const diff = roaster.diff;
	if (diff === undefined) return { type: "ok", config: EMPTY_CONFIG };
	if (!isRecord(diff)) return failure("invalid_table", formatMessage("[roaster.diff] must be a TOML table.", pathLabel));

	const exclude = diff.exclude;
	if (exclude === undefined) return { type: "ok", config: EMPTY_CONFIG };
	const parsedExclude = parseExcludeGlobs(exclude, pathLabel);
	if (parsedExclude.type === "error") return parsedExclude;
	return { type: "ok", config: { diff: { exclude: parsedExclude.value } } };
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

type ExcludeParseResult =
	| { readonly type: "ok"; readonly value: readonly string[] }
	| { readonly type: "error"; readonly error: ProjectConfigError };

function parseExcludeGlobs(value: unknown, pathLabel: string | undefined): ExcludeParseResult {
	if (!Array.isArray(value)) {
		return failure("invalid_exclude", formatMessage("[roaster.diff].exclude must be a TOML array of non-empty strings.", pathLabel));
	}

	const patterns: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim() === "") {
			return failure("invalid_exclude", formatMessage("[roaster.diff].exclude must contain only non-empty strings.", pathLabel));
		}
		const validation = validateRoasterExcludePattern(item, pathLabel);
		if (validation.type === "error") return validation;
		patterns.push(item);
	}
	return { type: "ok", value: patterns };
}

function validateRoasterExcludePattern(pattern: string, pathLabel: string | undefined): { readonly type: "ok" } | { readonly type: "error"; readonly error: ProjectConfigError } {
	if (pattern.startsWith(":(")) {
		return failure(
			"invalid_exclude",
			formatMessage("[roaster.diff].exclude entries must be plain glob patterns, not raw Git pathspecs.", pathLabel),
		);
	}
	if (pattern.startsWith("/")) {
		return failure("invalid_exclude", formatMessage("[roaster.diff].exclude entries must be repo-relative patterns.", pathLabel));
	}
	if (pattern.split("/").includes("..")) {
		return failure("invalid_exclude", formatMessage("[roaster.diff].exclude entries must not contain '..' path segments.", pathLabel));
	}
	return { type: "ok" };
}

function failure(code: ProjectConfigErrorCode, message: string): { readonly type: "error"; readonly error: ProjectConfigError } {
	return { type: "error", error: { code, message } };
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}

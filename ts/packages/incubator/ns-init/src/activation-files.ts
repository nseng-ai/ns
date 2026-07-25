import { z } from "zod";

import type { NsInitErrorInfo } from "./error-info.ts";

export const GENERATED_INSTRUCTIONS_PATH = ".ns/instructions.md";

export const ACTIVATION_FILES = [
	"ns-toml",
	"managed-extensions-ignore",
	"agents-instructions",
	"claude-instructions",
	"generated-instructions",
] as const;

export type ActivationFile = (typeof ACTIVATION_FILES)[number];
export const activationFileSchema = z.enum(ACTIVATION_FILES);

export const ACTIVATION_FILE_PATHS: Readonly<Record<ActivationFile, string>> = {
	"ns-toml": "ns.toml",
	"managed-extensions-ignore": ".gitignore",
	"agents-instructions": "AGENTS.md",
	"claude-instructions": "CLAUDE.md",
	"generated-instructions": GENERATED_INSTRUCTIONS_PATH,
};

export type ActivationTextFileReadResult =
	| { readonly type: "found"; readonly content: string }
	| { readonly type: "missing" }
	| { readonly type: "not-file" }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export type ConsumerDirectoryInspectionResult =
	| { readonly type: "missing" }
	| { readonly type: "directory"; readonly gitkeep: "missing" | "file" | "not-file" }
	| { readonly type: "not-directory" }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export type ExpectedActivationTextFileState =
	| { readonly type: "missing" }
	| { readonly type: "file"; readonly content: string };

export type ExpectedConsumerDirectoryState =
	| { readonly type: "missing" }
	| { readonly type: "directory"; readonly gitkeep: "missing" | "file" };

export interface PreparedActivationExpectedState {
	readonly files: Readonly<Record<ActivationFile, ExpectedActivationTextFileState>>;
	readonly consumerDirectories: Readonly<Record<string, ExpectedConsumerDirectoryState>>;
}

export type PreparedStateMismatchDetails =
	| {
			readonly type: "content";
			readonly path: string;
			readonly expectedContent: string;
			readonly actualContent: string;
	  }
	| {
			readonly type: "presence";
			readonly path: string;
			readonly expected: "missing" | "present";
			readonly actual: "missing" | "present";
	  }
	| {
			readonly type: "kind";
			readonly path: string;
			readonly expected: "missing" | "file" | "directory";
			readonly actual: "file" | "directory" | "other";
	  };

export type ActivationFilesCompareResult =
	| { readonly type: "applied" }
	| { readonly type: "mismatch"; readonly details: PreparedStateMismatchDetails }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export function compareActivationTextFileState(
	path: string,
	expected: ExpectedActivationTextFileState,
	actual: Exclude<ActivationTextFileReadResult, { type: "error" }>,
): PreparedStateMismatchDetails | undefined {
	if (actual.type === "not-file") {
		return activationKindMismatchDetails(
			path,
			expected.type === "missing" ? "missing" : "file",
			"directory",
		);
	}
	if (expected.type === "missing") {
		return actual.type === "missing"
			? undefined
			: activationPresenceMismatchDetails(path, "missing", "present");
	}
	if (actual.type === "missing") {
		return activationPresenceMismatchDetails(path, "present", "missing");
	}
	return actual.content === expected.content
		? undefined
		: {
				type: "content",
				path,
				expectedContent: expected.content,
				actualContent: actual.content,
			};
}

export function compareConsumerDirectoryState(
	path: string,
	expected: ExpectedConsumerDirectoryState,
	actual: Exclude<ConsumerDirectoryInspectionResult, { type: "error" }>,
): PreparedStateMismatchDetails | undefined {
	if (expected.type === "missing") {
		if (actual.type === "missing") return undefined;
		if (actual.type === "directory") {
			return activationPresenceMismatchDetails(path, "missing", "present");
		}
		return activationKindMismatchDetails(path, "missing", "file");
	}
	if (actual.type === "missing") {
		return activationPresenceMismatchDetails(path, "present", "missing");
	}
	if (actual.type === "not-directory") {
		return activationKindMismatchDetails(path, "directory", "file");
	}
	if (expected.gitkeep === actual.gitkeep) return undefined;
	const gitkeepPath = `${path}/.gitkeep`;
	if (actual.gitkeep === "not-file") {
		return activationKindMismatchDetails(
			gitkeepPath,
			expected.gitkeep === "missing" ? "missing" : "file",
			"directory",
		);
	}
	return activationPresenceMismatchDetails(
		gitkeepPath,
		expected.gitkeep === "missing" ? "missing" : "present",
		actual.gitkeep === "missing" ? "missing" : "present",
	);
}

export function activationPresenceMismatch(
	path: string,
	expected: "missing" | "present",
	actual: "missing" | "present",
): Extract<ActivationFilesCompareResult, { type: "mismatch" }> {
	return { type: "mismatch", details: activationPresenceMismatchDetails(path, expected, actual) };
}

export function activationKindMismatch(
	path: string,
	expected: "missing" | "file" | "directory",
	actual: "file" | "directory" | "other",
): Extract<ActivationFilesCompareResult, { type: "mismatch" }> {
	return { type: "mismatch", details: activationKindMismatchDetails(path, expected, actual) };
}

export function activationFilesCompareError(
	result: Exclude<ActivationFilesCompareResult, { type: "applied" }>,
): NsInitErrorInfo {
	if (result.type === "error") return result.error;
	return {
		code: "activation-prepared-state-mismatch",
		message: `${result.details.path} changed after activation was prepared; no mutation was applied to that path.`,
		details: { ...result.details },
	};
}

function activationPresenceMismatchDetails(
	path: string,
	expected: "missing" | "present",
	actual: "missing" | "present",
): PreparedStateMismatchDetails {
	return { type: "presence", path, expected, actual };
}

function activationKindMismatchDetails(
	path: string,
	expected: "missing" | "file" | "directory",
	actual: "file" | "directory" | "other",
): PreparedStateMismatchDetails {
	return { type: "kind", path, expected, actual };
}

export interface ActivationFileParams {
	readonly repoRoot: string;
	readonly file: ActivationFile;
}

export interface CompareAndWriteActivationFileParams extends ActivationFileParams {
	readonly expected: ExpectedActivationTextFileState;
	readonly content: string;
}

export interface ConsumerDirectoryParams {
	readonly repoRoot: string;
	readonly relativePath: string;
}

export interface CompareAndEnsureConsumerDirectoryParams extends ConsumerDirectoryParams {
	readonly expected: ExpectedConsumerDirectoryState;
}

export interface ActivationFilesGateway {
	readActivationFile(params: ActivationFileParams): Promise<ActivationTextFileReadResult>;
	inspectConsumerDirectory(
		params: ConsumerDirectoryParams,
	): Promise<ConsumerDirectoryInspectionResult>;
	compareAndWriteActivationFile(
		params: CompareAndWriteActivationFileParams,
	): Promise<ActivationFilesCompareResult>;
	compareAndEnsureConsumerDirectory(
		params: CompareAndEnsureConsumerDirectoryParams,
	): Promise<ActivationFilesCompareResult>;
}

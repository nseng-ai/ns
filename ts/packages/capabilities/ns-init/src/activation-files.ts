import type { NsInitErrorInfo } from "./error-info.ts";

export const ACTIVATION_FILES = [
	"ns-toml",
	"managed-extensions-ignore",
	"agents-instructions",
	"claude-instructions",
	"generated-instructions",
] as const;

export type ActivationFile = (typeof ACTIVATION_FILES)[number];

export const ACTIVATION_FILE_PATHS: Readonly<Record<ActivationFile, string>> = {
	"ns-toml": "ns.toml",
	"managed-extensions-ignore": ".gitignore",
	"agents-instructions": "AGENTS.md",
	"claude-instructions": "CLAUDE.md",
	"generated-instructions": ".ns/instructions.md",
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

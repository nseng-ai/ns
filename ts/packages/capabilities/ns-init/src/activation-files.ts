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

export type ActivationFilesOperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: NsInitErrorInfo };

export interface ActivationFileParams {
	readonly repoRoot: string;
	readonly file: ActivationFile;
}

export interface WriteActivationFileParams extends ActivationFileParams {
	readonly content: string;
}

export interface ConsumerDirectoryParams {
	readonly repoRoot: string;
	readonly relativePath: string;
}

export interface ActivationFilesGateway {
	readActivationFile(params: ActivationFileParams): Promise<ActivationTextFileReadResult>;
	inspectConsumerDirectory(
		params: ConsumerDirectoryParams,
	): Promise<ConsumerDirectoryInspectionResult>;
	writeActivationFile(params: WriteActivationFileParams): Promise<ActivationFilesOperationResult>;
	ensureConsumerDirectory(params: ConsumerDirectoryParams): Promise<ActivationFilesOperationResult>;
}

import type { NsInitErrorInfo } from "./error-info.ts";

export type InstructionFileName = "AGENTS.md" | "CLAUDE.md";

export const INSTRUCTION_FILE_NAMES = [
	"AGENTS.md",
	"CLAUDE.md",
] as const satisfies readonly InstructionFileName[];

export const OBJECTIVES_DIRECTORY_RELATIVE_PATH = ".ns/objectives";

export type TextFileReadResult =
	| { type: "found"; content: string }
	| { type: "missing" }
	| { type: "error"; error: NsInitErrorInfo };

export type ActivationFilesOperationResult = { ok: true } | { ok: false; error: NsInitErrorInfo };

export type EnsureObjectivesDirectoryResult =
	| { ok: true; value: { created: boolean } }
	| { ok: false; error: NsInitErrorInfo };

export interface InstructionFileParams {
	repoRoot: string;
	file: InstructionFileName;
}

export interface WriteInstructionFileParams extends InstructionFileParams {
	content: string;
}

export interface ProjectConfigFileParams {
	repoRoot: string;
}

export interface WriteProjectConfigFileParams extends ProjectConfigFileParams {
	content: string;
}

export interface ActivationFilesGateway {
	readInstructionFile(params: InstructionFileParams): Promise<TextFileReadResult>;
	writeInstructionFile(params: WriteInstructionFileParams): Promise<ActivationFilesOperationResult>;
	readProjectConfigFile(params: ProjectConfigFileParams): Promise<TextFileReadResult>;
	writeProjectConfigFile(
		params: WriteProjectConfigFileParams,
	): Promise<ActivationFilesOperationResult>;
	ensureObjectivesDirectory(params: { repoRoot: string }): Promise<EnsureObjectivesDirectoryResult>;
}

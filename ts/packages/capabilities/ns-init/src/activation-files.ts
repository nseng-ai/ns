export type InstructionFileName = "AGENTS.md" | "CLAUDE.md";

export const INSTRUCTION_FILE_NAMES = [
	"AGENTS.md",
	"CLAUDE.md",
] as const satisfies readonly InstructionFileName[];

export const OBJECTIVES_DIRECTORY_RELATIVE_PATH = ".ns/objectives";

export interface ActivationFilesErrorInfo {
	code: string;
	message: string;
}

export type InstructionFileReadResult =
	| { type: "found"; content: string }
	| { type: "missing" }
	| { type: "error"; error: ActivationFilesErrorInfo };

export type ActivationFilesOperationResult =
	| { ok: true }
	| { ok: false; error: ActivationFilesErrorInfo };

export type EnsureObjectivesDirectoryResult =
	| { ok: true; value: { created: boolean } }
	| { ok: false; error: ActivationFilesErrorInfo };

export interface InstructionFileParams {
	repoRoot: string;
	file: InstructionFileName;
}

export interface WriteInstructionFileParams extends InstructionFileParams {
	content: string;
}

export interface ActivationFilesGateway {
	readInstructionFile(params: InstructionFileParams): Promise<InstructionFileReadResult>;
	writeInstructionFile(params: WriteInstructionFileParams): Promise<ActivationFilesOperationResult>;
	ensureObjectivesDirectory(params: { repoRoot: string }): Promise<EnsureObjectivesDirectoryResult>;
}

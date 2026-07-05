import type {
	ActivationFilesErrorInfo,
	ActivationFilesGateway,
	ActivationFilesOperationResult,
	EnsureObjectivesDirectoryResult,
	InstructionFileName,
	InstructionFileParams,
	InstructionFileReadResult,
	WriteInstructionFileParams,
} from "./activation-files.ts";
import { INSTRUCTION_FILE_NAMES } from "./activation-files.ts";

export interface InMemoryActivationFilesState {
	instructionFiles?: Readonly<Partial<Record<InstructionFileName, string>>>;
	objectivesDirectoryPresent?: boolean;
	readFailure?: ActivationFilesErrorInfo;
	writeFailure?: ActivationFilesErrorInfo;
	ensureObjectivesDirectoryFailure?: ActivationFilesErrorInfo;
}

export class InMemoryActivationFilesGateway implements ActivationFilesGateway {
	private readonly instructionFiles: Map<InstructionFileName, string>;
	private objectivesDirectoryPresent: boolean;
	private readonly readFailure: ActivationFilesErrorInfo | undefined;
	private readonly writeFailure: ActivationFilesErrorInfo | undefined;
	private readonly ensureObjectivesDirectoryFailure: ActivationFilesErrorInfo | undefined;

	constructor(state: InMemoryActivationFilesState = {}) {
		this.instructionFiles = new Map();
		for (const name of INSTRUCTION_FILE_NAMES) {
			const content = state.instructionFiles?.[name];
			if (content !== undefined) this.instructionFiles.set(name, content);
		}
		this.objectivesDirectoryPresent = state.objectivesDirectoryPresent ?? false;
		this.readFailure = state.readFailure;
		this.writeFailure = state.writeFailure;
		this.ensureObjectivesDirectoryFailure = state.ensureObjectivesDirectoryFailure;
	}

	async readInstructionFile(params: InstructionFileParams): Promise<InstructionFileReadResult> {
		if (this.readFailure !== undefined) return { type: "error", error: this.readFailure };
		const content = this.instructionFiles.get(params.file);
		if (content === undefined) return { type: "missing" };
		return { type: "found", content };
	}

	async writeInstructionFile(
		params: WriteInstructionFileParams,
	): Promise<ActivationFilesOperationResult> {
		if (this.writeFailure !== undefined) return { ok: false, error: this.writeFailure };
		this.instructionFiles.set(params.file, params.content);
		return { ok: true };
	}

	async ensureObjectivesDirectory(): Promise<EnsureObjectivesDirectoryResult> {
		if (this.ensureObjectivesDirectoryFailure !== undefined) {
			return { ok: false, error: this.ensureObjectivesDirectoryFailure };
		}
		if (this.objectivesDirectoryPresent) return { ok: true, value: { created: false } };
		this.objectivesDirectoryPresent = true;
		return { ok: true, value: { created: true } };
	}

	instructionFileContent(file: InstructionFileName): string | undefined {
		return this.instructionFiles.get(file);
	}

	hasObjectivesDirectory(): boolean {
		return this.objectivesDirectoryPresent;
	}
}

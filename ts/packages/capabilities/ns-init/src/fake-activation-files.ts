import {
	ACTIVATION_FILE_PATHS,
	type ActivationFileParams,
	type ActivationFilesGateway,
	type ActivationFilesOperationResult,
	type ActivationTextFileReadResult,
	type ConsumerDirectoryInspectionResult,
	type ConsumerDirectoryParams,
	type WriteActivationFileParams,
} from "./activation-files.ts";
import type { NsInitErrorInfo } from "./error-info.ts";

export interface InMemoryActivationFilesState {
	readonly files?: Readonly<Record<string, string>>;
	readonly directories?: readonly string[];
	readonly nonFilePaths?: readonly string[];
	readonly nonDirectoryPaths?: readonly string[];
	readonly readFailure?: NsInitErrorInfo;
	readonly writeFailures?: Readonly<Record<string, NsInitErrorInfo>>;
	readonly directoryFailures?: Readonly<Record<string, NsInitErrorInfo>>;
}

export type ActivationFileOperation =
	| { readonly type: "write"; readonly path: string }
	| { readonly type: "ensure-directory"; readonly path: string };

export class InMemoryActivationFilesGateway implements ActivationFilesGateway {
	private readonly files: Map<string, string>;
	private readonly directories: Set<string>;
	private readonly nonFilePaths: Set<string>;
	private readonly nonDirectoryPaths: Set<string>;
	private readonly readFailure: NsInitErrorInfo | undefined;
	private readonly writeFailures: Readonly<Record<string, NsInitErrorInfo>>;
	private readonly directoryFailures: Readonly<Record<string, NsInitErrorInfo>>;
	private readonly operationLog: ActivationFileOperation[] = [];

	constructor(state: InMemoryActivationFilesState = {}) {
		this.files = new Map(Object.entries(state.files ?? {}));
		this.directories = new Set(state.directories ?? []);
		this.nonFilePaths = new Set(state.nonFilePaths ?? []);
		this.nonDirectoryPaths = new Set(state.nonDirectoryPaths ?? []);
		this.readFailure = state.readFailure;
		this.writeFailures = { ...state.writeFailures };
		this.directoryFailures = { ...state.directoryFailures };
	}

	async readActivationFile(params: ActivationFileParams): Promise<ActivationTextFileReadResult> {
		const relativePath = ACTIVATION_FILE_PATHS[params.file];
		if (this.readFailure !== undefined) return { type: "error", error: this.readFailure };
		if (this.nonFilePaths.has(relativePath)) return { type: "not-file" };
		const content = this.files.get(relativePath);
		return content === undefined ? { type: "missing" } : { type: "found", content };
	}

	async inspectConsumerDirectory(
		params: ConsumerDirectoryParams,
	): Promise<ConsumerDirectoryInspectionResult> {
		if (this.readFailure !== undefined) return { type: "error", error: this.readFailure };
		if (this.nonDirectoryPaths.has(params.relativePath)) return { type: "not-directory" };
		if (!this.directories.has(params.relativePath)) return { type: "missing" };
		const gitkeepPath = `${params.relativePath}/.gitkeep`;
		return {
			type: "directory",
			gitkeep: this.nonFilePaths.has(gitkeepPath)
				? "not-file"
				: this.files.has(gitkeepPath)
					? "file"
					: "missing",
		};
	}

	async writeActivationFile(
		params: WriteActivationFileParams,
	): Promise<ActivationFilesOperationResult> {
		const relativePath = ACTIVATION_FILE_PATHS[params.file];
		const failure = this.writeFailures[relativePath];
		if (failure !== undefined) return { ok: false, error: failure };
		this.files.set(relativePath, params.content);
		this.operationLog.push({ type: "write", path: relativePath });
		return { ok: true };
	}

	async ensureConsumerDirectory(
		params: ConsumerDirectoryParams,
	): Promise<ActivationFilesOperationResult> {
		const failure = this.directoryFailures[params.relativePath];
		if (failure !== undefined) return { ok: false, error: failure };
		this.directories.add(params.relativePath);
		const gitkeepPath = `${params.relativePath}/.gitkeep`;
		if (!this.files.has(gitkeepPath)) this.files.set(gitkeepPath, "");
		this.operationLog.push({ type: "ensure-directory", path: params.relativePath });
		return { ok: true };
	}

	fileContent(relativePath: string): string | undefined {
		return this.files.get(relativePath);
	}

	hasDirectory(relativePath: string): boolean {
		return this.directories.has(relativePath);
	}

	operations(): readonly ActivationFileOperation[] {
		return [...this.operationLog];
	}
}

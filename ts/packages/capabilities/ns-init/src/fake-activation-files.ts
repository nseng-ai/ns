import type {
	ProjectConfigGateway,
	ProjectConfigPathExistsResult,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config";

import {
	ACTIVATION_FILE_PATHS,
	compareActivationTextFileState,
	compareConsumerDirectoryState,
	type ActivationFileParams,
	type ActivationFilesCompareResult,
	type ActivationFilesGateway,
	type ActivationTextFileReadResult,
	type CompareAndEnsureConsumerDirectoryParams,
	type CompareAndWriteActivationFileParams,
	type ConsumerDirectoryInspectionResult,
	type ConsumerDirectoryParams,
} from "./activation-files.ts";
import type { NsInitErrorInfo } from "./error-info.ts";

export interface InMemoryActivationFilesState {
	readonly files?: Readonly<Record<string, string>>;
	readonly directories?: readonly string[];
	readonly nonFilePaths?: readonly string[];
	readonly nonDirectoryPaths?: readonly string[];
	readonly readFailure?: NsInitErrorInfo;
	readonly readFailures?: Readonly<Record<string, NsInitErrorInfo>>;
	readonly writeFailures?: Readonly<Record<string, NsInitErrorInfo>>;
	readonly directoryFailures?: Readonly<Record<string, NsInitErrorInfo>>;
}

export type ActivationFileOperation =
	| { readonly type: "write"; readonly path: string }
	| { readonly type: "ensure-directory"; readonly path: string };

export type ExternalActivationFilesMutation =
	| { readonly type: "write-file"; readonly path: string; readonly content: string }
	| { readonly type: "remove-file"; readonly path: string }
	| { readonly type: "replace-file-with-non-file"; readonly path: string }
	| { readonly type: "create-directory"; readonly path: string }
	| { readonly type: "remove-directory"; readonly path: string }
	| { readonly type: "replace-directory-with-non-directory"; readonly path: string };

export class InMemoryActivationFilesGateway
	implements ActivationFilesGateway, ProjectConfigGateway
{
	private readonly files: Map<string, string>;
	private readonly directories: Set<string>;
	private readonly nonFilePaths: Set<string>;
	private readonly nonDirectoryPaths: Set<string>;
	private readonly readFailure: NsInitErrorInfo | undefined;
	private readonly readFailures: Readonly<Record<string, NsInitErrorInfo>>;
	private readonly writeFailures: Readonly<Record<string, NsInitErrorInfo>>;
	private readonly directoryFailures: Readonly<Record<string, NsInitErrorInfo>>;
	private readonly operationLog: ActivationFileOperation[] = [];

	constructor(state: InMemoryActivationFilesState = {}) {
		this.files = new Map(Object.entries(state.files ?? {}));
		this.directories = new Set(state.directories ?? []);
		this.nonFilePaths = new Set(state.nonFilePaths ?? []);
		this.nonDirectoryPaths = new Set(state.nonDirectoryPaths ?? []);
		this.readFailure = state.readFailure;
		this.readFailures = { ...state.readFailures };
		this.writeFailures = { ...state.writeFailures };
		this.directoryFailures = { ...state.directoryFailures };
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		const failure = this.readFailures[request.relativePath] ?? this.readFailure;
		if (failure !== undefined) return { type: "error", message: failure.message };
		if (this.nonFilePaths.has(request.relativePath)) {
			return { type: "error", message: `${request.relativePath} is not a file.` };
		}
		const text = this.files.get(request.relativePath);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(request: { repoRoot: string; relativePath: string }): ProjectConfigPathExistsResult {
		return this.files.has(request.relativePath) ||
			this.directories.has(request.relativePath) ||
			this.nonFilePaths.has(request.relativePath) ||
			this.nonDirectoryPaths.has(request.relativePath)
			? { type: "present" }
			: { type: "missing" };
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

	async compareAndWriteActivationFile(
		params: CompareAndWriteActivationFileParams,
	): Promise<ActivationFilesCompareResult> {
		const relativePath = ACTIVATION_FILE_PATHS[params.file];
		const actual = await this.readActivationFile(params);
		if (actual.type === "error") return { type: "error", error: actual.error };
		const mismatch = compareActivationTextFileState(relativePath, params.expected, actual);
		if (mismatch !== undefined) return { type: "mismatch", details: mismatch };
		const failure = this.writeFailures[relativePath];
		if (failure !== undefined) return { type: "error", error: failure };
		this.files.set(relativePath, params.content);
		this.operationLog.push({ type: "write", path: relativePath });
		return { type: "applied" };
	}

	async compareAndEnsureConsumerDirectory(
		params: CompareAndEnsureConsumerDirectoryParams,
	): Promise<ActivationFilesCompareResult> {
		const actual = await this.inspectConsumerDirectory(params);
		if (actual.type === "error") return { type: "error", error: actual.error };
		const mismatch = compareConsumerDirectoryState(params.relativePath, params.expected, actual);
		if (mismatch !== undefined) return { type: "mismatch", details: mismatch };
		const failure = this.directoryFailures[params.relativePath];
		if (failure !== undefined) return { type: "error", error: failure };
		this.directories.add(params.relativePath);
		const gitkeepPath = `${params.relativePath}/.gitkeep`;
		this.files.set(gitkeepPath, "");
		this.operationLog.push({ type: "ensure-directory", path: params.relativePath });
		return { type: "applied" };
	}

	simulateExternalMutation(mutation: ExternalActivationFilesMutation): void {
		switch (mutation.type) {
			case "write-file":
				this.files.set(mutation.path, mutation.content);
				this.nonFilePaths.delete(mutation.path);
				return;
			case "remove-file":
				this.files.delete(mutation.path);
				this.nonFilePaths.delete(mutation.path);
				return;
			case "replace-file-with-non-file":
				this.files.delete(mutation.path);
				this.nonFilePaths.add(mutation.path);
				return;
			case "create-directory":
				this.directories.add(mutation.path);
				this.nonDirectoryPaths.delete(mutation.path);
				return;
			case "remove-directory":
				this.directories.delete(mutation.path);
				this.nonDirectoryPaths.delete(mutation.path);
				return;
			case "replace-directory-with-non-directory":
				this.directories.delete(mutation.path);
				this.nonDirectoryPaths.add(mutation.path);
		}
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

import {
	ACTIVATION_FILE_PATHS,
	type ActivationFileParams,
	type ActivationFilesCompareResult,
	type ActivationFilesGateway,
	type ActivationTextFileReadResult,
	type CompareAndEnsureConsumerDirectoryParams,
	type CompareAndWriteActivationFileParams,
	type ConsumerDirectoryInspectionResult,
	type ConsumerDirectoryParams,
	type ExpectedConsumerDirectoryState,
	type PreparedStateMismatchDetails,
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

export type ExternalActivationFilesMutation =
	| { readonly type: "write-file"; readonly path: string; readonly content: string }
	| { readonly type: "remove-file"; readonly path: string }
	| { readonly type: "replace-file-with-non-file"; readonly path: string }
	| { readonly type: "create-directory"; readonly path: string }
	| { readonly type: "remove-directory"; readonly path: string }
	| { readonly type: "replace-directory-with-non-directory"; readonly path: string };

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

	async compareAndWriteActivationFile(
		params: CompareAndWriteActivationFileParams,
	): Promise<ActivationFilesCompareResult> {
		const relativePath = ACTIVATION_FILE_PATHS[params.file];
		const actual = await this.readActivationFile(params);
		if (actual.type === "error") return { type: "error", error: actual.error };
		const mismatch = compareFileState(relativePath, params.expected, actual);
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
		const mismatch = compareConsumerState(params.relativePath, params.expected, actual);
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

function compareFileState(
	path: string,
	expected: CompareAndWriteActivationFileParams["expected"],
	actual: Exclude<ActivationTextFileReadResult, { type: "error" }>,
): PreparedStateMismatchDetails | undefined {
	if (actual.type === "not-file") {
		return {
			type: "kind",
			path,
			expected: expected.type === "missing" ? "missing" : "file",
			actual: "directory",
		};
	}
	if (expected.type === "missing") {
		return actual.type === "missing"
			? undefined
			: { type: "presence", path, expected: "missing", actual: "present" };
	}
	if (actual.type === "missing") {
		return { type: "presence", path, expected: "present", actual: "missing" };
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

function compareConsumerState(
	path: string,
	expected: ExpectedConsumerDirectoryState,
	actual: Exclude<ConsumerDirectoryInspectionResult, { type: "error" }>,
): PreparedStateMismatchDetails | undefined {
	if (expected.type === "missing") {
		if (actual.type === "missing") return undefined;
		if (actual.type === "directory") {
			return { type: "presence", path, expected: "missing", actual: "present" };
		}
		return { type: "kind", path, expected: "missing", actual: "file" };
	}
	if (actual.type === "missing") {
		return { type: "presence", path, expected: "present", actual: "missing" };
	}
	if (actual.type === "not-directory") {
		return { type: "kind", path, expected: "directory", actual: "file" };
	}
	if (expected.gitkeep === actual.gitkeep) return undefined;
	const gitkeepPath = `${path}/.gitkeep`;
	if (actual.gitkeep === "not-file") {
		return {
			type: "kind",
			path: gitkeepPath,
			expected: expected.gitkeep === "missing" ? "missing" : "file",
			actual: "directory",
		};
	}
	return {
		type: "presence",
		path: gitkeepPath,
		expected: expected.gitkeep === "missing" ? "missing" : "present",
		actual: actual.gitkeep === "missing" ? "missing" : "present",
	};
}

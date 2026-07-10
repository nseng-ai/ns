import { mkdir, open, readFile, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage, isNodeErrorCode } from "@nseng-ai/foundation/primitives";

import {
	ACTIVATION_FILE_PATHS,
	activationKindMismatch,
	activationPresenceMismatch,
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

export class RealActivationFilesGateway implements ActivationFilesGateway {
	async readActivationFile(params: ActivationFileParams): Promise<ActivationTextFileReadResult> {
		const target = join(params.repoRoot, ACTIVATION_FILE_PATHS[params.file]);
		try {
			const state = await stat(target);
			if (!state.isFile()) return { type: "not-file" };
			return { type: "found", content: await readFile(target, "utf8") };
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
			return {
				type: "error",
				error: { code: "activation-file-read-failed", message: formatErrorMessage(error) },
			};
		}
	}

	async inspectConsumerDirectory(
		params: ConsumerDirectoryParams,
	): Promise<ConsumerDirectoryInspectionResult> {
		const target = join(params.repoRoot, params.relativePath);
		try {
			const state = await stat(target);
			if (!state.isDirectory()) return { type: "not-directory" };
			try {
				const gitkeep = await stat(join(target, ".gitkeep"));
				return { type: "directory", gitkeep: gitkeep.isFile() ? "file" : "not-file" };
			} catch (error) {
				if (isNodeErrorCode(error, "ENOENT")) return { type: "directory", gitkeep: "missing" };
				throw error;
			}
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
			return {
				type: "error",
				error: { code: "consumer-directory-inspect-failed", message: formatErrorMessage(error) },
			};
		}
	}

	async compareAndWriteActivationFile(
		params: CompareAndWriteActivationFileParams,
	): Promise<ActivationFilesCompareResult> {
		const relativePath = ACTIVATION_FILE_PATHS[params.file];
		const target = join(params.repoRoot, relativePath);
		if (params.expected.type === "missing") {
			const comparison = await compareMissingPath(target, relativePath, "file");
			if (comparison !== undefined) return comparison;
			try {
				await mkdir(dirname(target), { recursive: true });
				const handle = await open(target, "wx");
				try {
					await writeAll(handle, params.content);
				} finally {
					await handle.close();
				}
				return { type: "applied" };
			} catch (error) {
				if (isNodeErrorCode(error, "EEXIST")) {
					return compareCreatedPath(target, relativePath, "file");
				}
				return writeError(error);
			}
		}

		let handle: FileHandle;
		try {
			handle = await open(target, "r+");
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) {
				return activationPresenceMismatch(relativePath, "present", "missing");
			}
			if (isNodeErrorCode(error, "EISDIR")) {
				return activationKindMismatch(relativePath, "file", "directory");
			}
			return writeError(error);
		}
		try {
			const state = await handle.stat();
			if (!state.isFile()) {
				return closeWithResult(
					handle,
					activationKindMismatch(relativePath, "file", state.isDirectory() ? "directory" : "other"),
				);
			}
			const actualContent = await handle.readFile("utf8");
			if (actualContent !== params.expected.content) {
				return closeWithResult(handle, {
					type: "mismatch",
					details: {
						type: "content",
						path: relativePath,
						expectedContent: params.expected.content,
						actualContent,
					},
				});
			}
			await writeAll(handle, params.content);
			return closeWithResult(handle, { type: "applied" });
		} catch (error) {
			return closeWithResult(handle, writeError(error));
		}
	}

	async compareAndEnsureConsumerDirectory(
		params: CompareAndEnsureConsumerDirectoryParams,
	): Promise<ActivationFilesCompareResult> {
		const inspected = await this.inspectConsumerDirectory(params);
		if (inspected.type === "error") return { type: "error", error: inspected.error };
		const mismatch = compareConsumerDirectoryState(params.relativePath, params.expected, inspected);
		if (mismatch !== undefined) return { type: "mismatch", details: mismatch };

		const target = join(params.repoRoot, params.relativePath);
		try {
			if (params.expected.type === "missing") {
				const created = await mkdir(target, { recursive: true });
				if (created === undefined) {
					return activationPresenceMismatch(params.relativePath, "missing", "present");
				}
			}
			const gitkeepPath = join(target, ".gitkeep");
			const gitkeepRelativePath = `${params.relativePath}/.gitkeep`;
			const gitkeepComparison = await compareMissingPath(gitkeepPath, gitkeepRelativePath, "file");
			if (gitkeepComparison !== undefined) return gitkeepComparison;
			const handle = await open(gitkeepPath, "wx");
			await handle.close();
			return { type: "applied" };
		} catch (error) {
			if (isNodeErrorCode(error, "EEXIST")) {
				return compareCreatedPath(
					join(target, ".gitkeep"),
					`${params.relativePath}/.gitkeep`,
					"file",
				);
			}
			return {
				type: "error",
				error: { code: "consumer-directory-create-failed", message: formatErrorMessage(error) },
			};
		}
	}
}

async function writeAll(handle: FileHandle, content: string): Promise<void> {
	const bytes = Buffer.from(content, "utf8");
	let offset = 0;
	while (offset < bytes.length) {
		const result = await handle.write(bytes, offset, bytes.length - offset, offset);
		offset += result.bytesWritten;
	}
	await handle.truncate(bytes.length);
}

async function compareMissingPath(
	target: string,
	relativePath: string,
	createdKind: "file" | "directory",
): Promise<ActivationFilesCompareResult | undefined> {
	try {
		const state = await stat(target);
		const actual = state.isFile() ? "file" : state.isDirectory() ? "directory" : "other";
		if (actual === createdKind)
			return activationPresenceMismatch(relativePath, "missing", "present");
		return activationKindMismatch(relativePath, "missing", actual);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return undefined;
		return {
			type: "error",
			error: { code: "activation-path-inspect-failed", message: formatErrorMessage(error) },
		};
	}
}

async function compareCreatedPath(
	target: string,
	relativePath: string,
	createdKind: "file" | "directory",
): Promise<ActivationFilesCompareResult> {
	const comparison = await compareMissingPath(target, relativePath, createdKind);
	return (
		comparison ?? {
			type: "error",
			error: {
				code: "activation-path-race-unresolved",
				message: `${relativePath} changed while activation was applying.`,
			},
		}
	);
}

async function closeWithResult(
	handle: FileHandle,
	result: ActivationFilesCompareResult,
): Promise<ActivationFilesCompareResult> {
	try {
		await handle.close();
		return result;
	} catch (error) {
		return writeError(error);
	}
}

function writeError(error: unknown): ActivationFilesCompareResult {
	return {
		type: "error",
		error: { code: "activation-file-write-failed", message: formatErrorMessage(error) },
	};
}

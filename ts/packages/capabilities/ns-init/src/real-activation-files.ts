import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type {
	ActivationFilesGateway,
	ActivationFilesOperationResult,
	EnsureObjectivesDirectoryResult,
	InstructionFileParams,
	ProjectConfigFileParams,
	TextFileReadResult,
	WriteInstructionFileParams,
	WriteProjectConfigFileParams,
} from "./activation-files.ts";
import { OBJECTIVES_DIRECTORY_RELATIVE_PATH } from "./activation-files.ts";

export class RealActivationFilesGateway implements ActivationFilesGateway {
	async readInstructionFile(params: InstructionFileParams): Promise<TextFileReadResult> {
		return readTextFile(params.repoRoot, params.file, "instruction-file-read-failed");
	}

	async writeInstructionFile(
		params: WriteInstructionFileParams,
	): Promise<ActivationFilesOperationResult> {
		return writeTextFile({
			repoRoot: params.repoRoot,
			relativePath: params.file,
			content: params.content,
			errorCode: "instruction-file-write-failed",
		});
	}

	async readProjectConfigFile(params: ProjectConfigFileParams): Promise<TextFileReadResult> {
		return readTextFile(params.repoRoot, "ns.toml", "ns-toml-read-failed");
	}

	async writeProjectConfigFile(
		params: WriteProjectConfigFileParams,
	): Promise<ActivationFilesOperationResult> {
		return writeTextFile({
			repoRoot: params.repoRoot,
			relativePath: "ns.toml",
			content: params.content,
			errorCode: "ns-toml-write-failed",
		});
	}

	async ensureObjectivesDirectory(params: {
		repoRoot: string;
	}): Promise<EnsureObjectivesDirectoryResult> {
		const directoryPath = path.join(params.repoRoot, OBJECTIVES_DIRECTORY_RELATIVE_PATH);
		try {
			const existing = await statOrMissing(directoryPath);
			if (existing !== undefined) {
				if (!existing.isDirectory()) {
					return {
						ok: false,
						error: {
							code: "objectives-path-not-directory",
							message: `${OBJECTIVES_DIRECTORY_RELATIVE_PATH} exists but is not a directory.`,
						},
					};
				}
				return { ok: true, value: { created: false } };
			}
			await mkdir(directoryPath, { recursive: true });
			await writeFile(path.join(directoryPath, ".gitkeep"), "", "utf8");
			return { ok: true, value: { created: true } };
		} catch (error) {
			return {
				ok: false,
				error: {
					code: "objectives-directory-create-failed",
					message: formatErrorMessage(error),
				},
			};
		}
	}
}

async function readTextFile(
	repoRoot: string,
	relativePath: string,
	errorCode: string,
): Promise<TextFileReadResult> {
	try {
		const content = await readFile(path.join(repoRoot, relativePath), "utf8");
		return { type: "found", content };
	} catch (error) {
		if (errnoCode(error) === "ENOENT") return { type: "missing" };
		return {
			type: "error",
			error: { code: errorCode, message: formatErrorMessage(error) },
		};
	}
}

interface WriteTextFileOptions {
	repoRoot: string;
	relativePath: string;
	content: string;
	errorCode: string;
}

async function writeTextFile(
	options: WriteTextFileOptions,
): Promise<ActivationFilesOperationResult> {
	try {
		await writeFile(path.join(options.repoRoot, options.relativePath), options.content, "utf8");
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: { code: options.errorCode, message: formatErrorMessage(error) },
		};
	}
}

async function statOrMissing(
	targetPath: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
	try {
		return await stat(targetPath);
	} catch (error) {
		if (errnoCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

function errnoCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type {
	ActivationFilesGateway,
	ActivationFilesOperationResult,
	EnsureObjectivesDirectoryResult,
	InstructionFileParams,
	InstructionFileReadResult,
	WriteInstructionFileParams,
} from "./activation-files.ts";
import { OBJECTIVES_DIRECTORY_RELATIVE_PATH } from "./activation-files.ts";

export class RealActivationFilesGateway implements ActivationFilesGateway {
	async readInstructionFile(params: InstructionFileParams): Promise<InstructionFileReadResult> {
		try {
			const content = await readFile(path.join(params.repoRoot, params.file), "utf8");
			return { type: "found", content };
		} catch (error) {
			if (errnoCode(error) === "ENOENT") return { type: "missing" };
			return {
				type: "error",
				error: { code: "instruction-file-read-failed", message: formatErrorMessage(error) },
			};
		}
	}

	async writeInstructionFile(
		params: WriteInstructionFileParams,
	): Promise<ActivationFilesOperationResult> {
		try {
			await writeFile(path.join(params.repoRoot, params.file), params.content, "utf8");
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: { code: "instruction-file-write-failed", message: formatErrorMessage(error) },
			};
		}
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

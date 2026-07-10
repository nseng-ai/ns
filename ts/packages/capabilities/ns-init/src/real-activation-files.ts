import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage, isNodeErrorCode } from "@nseng-ai/foundation/primitives";

import type {
	ActivationFilesGateway,
	ActivationFilesOperationResult,
	ActivationPathParams,
	ActivationTextFileReadResult,
	ConsumerDirectoryInspectionResult,
	WriteActivationTextFileParams,
} from "./activation-files.ts";

export class RealActivationFilesGateway implements ActivationFilesGateway {
	async readTextFile(params: ActivationPathParams): Promise<ActivationTextFileReadResult> {
		const target = join(params.repoRoot, params.relativePath);
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
		params: ActivationPathParams,
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

	async writeTextFile(
		params: WriteActivationTextFileParams,
	): Promise<ActivationFilesOperationResult> {
		const target = join(params.repoRoot, params.relativePath);
		try {
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, params.content, "utf8");
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: { code: "activation-file-write-failed", message: formatErrorMessage(error) },
			};
		}
	}

	async ensureConsumerDirectory(
		params: ActivationPathParams,
	): Promise<ActivationFilesOperationResult> {
		const target = join(params.repoRoot, params.relativePath);
		try {
			await mkdir(target, { recursive: true });
			const gitkeep = join(target, ".gitkeep");
			try {
				const existing = await stat(gitkeep);
				if (!existing.isFile()) {
					return {
						ok: false,
						error: {
							code: "consumer-gitkeep-not-file",
							message: `${params.relativePath}/.gitkeep exists but is not a file.`,
						},
					};
				}
			} catch (error) {
				if (!isNodeErrorCode(error, "ENOENT")) throw error;
				await writeFile(gitkeep, "", "utf8");
			}
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: { code: "consumer-directory-create-failed", message: formatErrorMessage(error) },
			};
		}
	}
}

import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { formatErrorMessage } from "@asdl/core/primitives";

import type {
	ObjectiveDirectoryEntry,
	ObjectiveMarkdownReadResult,
	ObjectivePathKind,
	ObjectiveStorageGateway,
	ObjectiveStorageResult,
} from "./storage.ts";

export class RealObjectiveStorageGateway implements ObjectiveStorageGateway {
	private readonly repoRoot: string;

	constructor(repoRoot: string) {
		this.repoRoot = repoRoot;
	}

	async pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>> {
		try {
			return { ok: true, value: kindFromStats(await lstat(this.absolutePath(relativePath))) };
		} catch (error) {
			if (isMissingError(error)) return { ok: true, value: "missing" };
			return storageError("path-kind-failed", `Failed to inspect ${relativePath}: ${formatErrorMessage(error)}`);
		}
	}

	async listDirectory(relativePath: string): Promise<ObjectiveStorageResult<readonly ObjectiveDirectoryEntry[]>> {
		try {
			const entries = await readdir(this.absolutePath(relativePath), { withFileTypes: true });
			return {
				ok: true,
				value: entries.map((entry) => ({
					name: entry.name,
					kind: kindFromDirent(entry),
				})),
			};
		} catch (error) {
			if (isMissingError(error)) return { ok: true, value: [] };
			return storageError("list-directory-failed", `Failed to list ${relativePath}: ${formatErrorMessage(error)}`);
		}
	}

	async readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult> {
		const kind = await this.pathKind(relativePath);
		if (!kind.ok) return { type: "unreadable", message: kind.error.message };
		if (kind.value !== "file") return { type: "missing" };
		try {
			return { type: "ok", content: await readFile(this.absolutePath(relativePath), "utf8") };
		} catch (error) {
			return { type: "unreadable", message: `Failed to read ${relativePath}: ${formatErrorMessage(error)}` };
		}
	}

	private absolutePath(relativePath: string): string {
		return resolve(this.repoRoot, relativePath);
	}
}

function kindFromStats(stats: { isFile(): boolean; isDirectory(): boolean }): ObjectivePathKind {
	if (stats.isFile()) return "file";
	if (stats.isDirectory()) return "directory";
	return "other";
}

function kindFromDirent(entry: { isFile(): boolean; isDirectory(): boolean }): ObjectivePathKind {
	if (entry.isFile()) return "file";
	if (entry.isDirectory()) return "directory";
	return "other";
}

function isMissingError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function storageError<T>(code: string, message: string): ObjectiveStorageResult<T> {
	return { ok: false, error: { code, message } };
}

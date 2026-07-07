import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import { sortStrings } from "./sort.ts";

export interface HarnessArtifactFileSystemErrorInfo {
	code: "filesystem_error";
	message: string;
	details: { path: string; operation: "stat" | "list" | "read" | "write" };
}

export type OptionalFileState = { type: "missing" } | { type: "file"; bytes: Uint8Array };
export type OptionalTextFileState = { type: "missing" } | { type: "file"; text: string };

export type ModuleDiscoveryDirectoryState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory"; entries: readonly ModuleDiscoveryDirectoryEntry[] };

export interface ModuleDiscoveryDirectoryEntry {
	name: string;
	type: "directory" | "file" | "other";
}

export type ModuleDiscoveryTextFileState = { type: "missing" } | { type: "file"; text: string };

export type ModuleDiscoveryPathState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory" }
	| { type: "other" };

export interface HarnessArtifactFileSystemGateway {
	listFiles(
		rootPath: string,
	): Promise<Result<readonly string[], HarnessArtifactFileSystemErrorInfo>>;
	readOptionalFile(
		path: string,
	): Promise<Result<OptionalFileState, HarnessArtifactFileSystemErrorInfo>>;
	writeFile(
		path: string,
		bytes: Uint8Array,
	): Promise<Result<void, HarnessArtifactFileSystemErrorInfo>>;
	readOptionalTextFile(
		path: string,
	): Promise<Result<OptionalTextFileState, HarnessArtifactFileSystemErrorInfo>>;
	writeTextFile(
		path: string,
		text: string,
	): Promise<Result<void, HarnessArtifactFileSystemErrorInfo>>;
}

export interface HarnessArtifactModuleDiscoveryGateway {
	readDirectory(
		path: string,
	): Promise<Result<ModuleDiscoveryDirectoryState, HarnessArtifactFileSystemErrorInfo>>;
	readOptionalTextFile(
		path: string,
	): Promise<Result<ModuleDiscoveryTextFileState, HarnessArtifactFileSystemErrorInfo>>;
	pathState(
		path: string,
	): Promise<Result<ModuleDiscoveryPathState, HarnessArtifactFileSystemErrorInfo>>;
}

export const nodeHarnessArtifactFileSystemGateway: HarnessArtifactFileSystemGateway &
	HarnessArtifactModuleDiscoveryGateway = {
	async listFiles(rootPath) {
		try {
			return resultOk(await listFiles(rootPath));
		} catch (error) {
			return resultErr(fileSystemError(rootPath, "list", error));
		}
	},
	async readOptionalFile(path) {
		try {
			return resultOk({ type: "file", bytes: await readFile(path) });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "read", error));
		}
	},
	async writeFile(path, bytes) {
		try {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, bytes);
			return resultOk(undefined);
		} catch (error) {
			return resultErr(fileSystemError(path, "write", error));
		}
	},
	async readOptionalTextFile(path) {
		try {
			return resultOk({ type: "file", text: await readFile(path, "utf8") });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "read", error));
		}
	},
	async writeTextFile(path, text) {
		try {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, text, "utf8");
			return resultOk(undefined);
		} catch (error) {
			return resultErr(fileSystemError(path, "write", error));
		}
	},
	async readDirectory(path) {
		try {
			const pathStat = await stat(path);
			if (pathStat.isFile()) return resultOk({ type: "file" });
			if (!pathStat.isDirectory()) return resultOk({ type: "file" });
			const entries = await readdir(path, { withFileTypes: true });
			return resultOk({
				type: "directory",
				entries: entries.map((entry) => ({
					name: entry.name,
					type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
				})),
			});
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "list", error));
		}
	},
	async pathState(path) {
		try {
			const pathStat = await stat(path);
			if (pathStat.isDirectory()) return resultOk({ type: "directory" });
			if (pathStat.isFile()) return resultOk({ type: "file" });
			return resultOk({ type: "other" });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "stat", error));
		}
	},
};

export const nodeHarnessArtifactModuleDiscoveryGateway = nodeHarnessArtifactFileSystemGateway;

export function fileSystemError(
	path: string,
	operation: HarnessArtifactFileSystemErrorInfo["details"]["operation"],
	error: unknown,
): HarnessArtifactFileSystemErrorInfo {
	return {
		code: "filesystem_error",
		message: `Filesystem ${operation} failed for ${path}: ${formatErrorMessage(error)}`,
		details: { path, operation },
	};
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function listFiles(rootPath: string): Promise<readonly string[]> {
	return sortStrings(await walkFiles(rootPath, ""));
}

async function walkFiles(rootPath: string, relativePath: string): Promise<readonly string[]> {
	const directory = relativePath === "" ? rootPath : join(rootPath, relativePath);
	const entries = await readdir(directory, { withFileTypes: true });
	const output: string[] = [];
	for (const entry of entries) {
		const entryRelativePath = relativePath === "" ? entry.name : join(relativePath, entry.name);
		if (entry.isDirectory()) {
			output.push(...(await walkFiles(rootPath, entryRelativePath)));
		} else if (entry.isFile()) {
			output.push(entryRelativePath);
		} else {
			throw new Error(`Unsupported non-file source path: ${join(rootPath, entryRelativePath)}`);
		}
	}
	return output;
}

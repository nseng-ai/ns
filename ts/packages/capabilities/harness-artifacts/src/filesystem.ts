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
	): Promise<Result<OptionalTextFileState, HarnessArtifactFileSystemErrorInfo>>;
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
		return withMissingAsOk({
			path,
			operation: "read",
			run: async () => ({ type: "file", bytes: await readFile(path) }),
		});
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
		const state = await nodeHarnessArtifactFileSystemGateway.readOptionalFile(path);
		if (!state.ok) return state;
		if (state.value.type === "missing") return resultOk({ type: "missing" });
		return resultOk({ type: "file", text: new TextDecoder().decode(state.value.bytes) });
	},
	async writeTextFile(path, text) {
		return nodeHarnessArtifactFileSystemGateway.writeFile(path, new TextEncoder().encode(text));
	},
	async readDirectory(path) {
		return withMissingAsOk({
			path,
			operation: "list",
			async run() {
				const pathStat = await stat(path);
				if (pathStat.isFile()) return { type: "file" } as const;
				if (!pathStat.isDirectory()) return { type: "file" } as const;
				const entries = await readdir(path, { withFileTypes: true });
				return {
					type: "directory",
					entries: entries.map((entry) => ({
						name: entry.name,
						type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
					})),
				} as const;
			},
		});
	},
	async pathState(path) {
		return withMissingAsOk({
			path,
			operation: "stat",
			async run() {
				const pathStat = await stat(path);
				if (pathStat.isDirectory()) return { type: "directory" } as const;
				if (pathStat.isFile()) return { type: "file" } as const;
				return { type: "other" } as const;
			},
		});
	},
};

async function withMissingAsOk<T>(options: {
	path: string;
	operation: HarnessArtifactFileSystemErrorInfo["details"]["operation"];
	run: () => Promise<T>;
}): Promise<Result<T | { type: "missing" }, HarnessArtifactFileSystemErrorInfo>> {
	try {
		return resultOk(await options.run());
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
		return resultErr(fileSystemError(options.path, options.operation, error));
	}
}

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

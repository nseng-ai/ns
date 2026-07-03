import { open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { ensurePrivateParentDirectory } from "@ji/capability-kit/xdg";

export interface PlanStoreGateway {
	listDirectory(path: string): Promise<PlanStoreDirectoryRead>;
	statPath(path: string): Promise<PlanStorePathStat | undefined>;
	readTextFile(path: string): Promise<string>;
	writeTextFileExclusive(path: string, content: string): Promise<void>;
	realpathOrResolve(path: string): Promise<string>;
}

export type PlanStoreDirectoryRead =
	| { type: "present"; entries: readonly PlanStoreDirectoryEntry[] }
	| { type: "missing" };

export interface PlanStoreDirectoryEntry {
	name: string;
	type: PlanStorePathType;
}

export interface PlanStorePathStat {
	type: PlanStorePathType;
	mtimeMs: number;
}

export type PlanStorePathType = "file" | "directory" | "other";

export class RealPlanStoreGateway implements PlanStoreGateway {
	async listDirectory(path: string): Promise<PlanStoreDirectoryRead> {
		try {
			const entries = await readdir(path, { withFileTypes: true });
			return {
				type: "present",
				entries: entries.map((entry) => ({ name: entry.name, type: direntType(entry) })),
			};
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return { type: "missing" };
			throw error;
		}
	}

	async statPath(path: string): Promise<PlanStorePathStat | undefined> {
		try {
			const pathStat = await stat(path);
			return { type: statsType(pathStat), mtimeMs: pathStat.mtimeMs };
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return undefined;
			throw error;
		}
	}

	async readTextFile(path: string): Promise<string> {
		return await readFile(path, "utf8");
	}

	async writeTextFileExclusive(path: string, content: string): Promise<void> {
		await ensurePrivateParentDirectory(path);
		let file: Awaited<ReturnType<typeof open>> | undefined;
		try {
			file = await open(path, "wx");
			await file.writeFile(content, "utf8");
		} catch (error) {
			if (isNodeError(error) && error.code === "EEXIST") {
				throw new Error(
					`Saved plan file already exists in the local plan store; refusing to overwrite.\nPath: ${path}`,
				);
			}
			throw error;
		} finally {
			await file?.close();
		}
	}

	async realpathOrResolve(path: string): Promise<string> {
		try {
			return await realpath(path);
		} catch {
			// Missing paths still need stable containment comparisons at the domain layer.
			return resolve(path);
		}
	}
}

export function createRealPlanStoreGateway(): PlanStoreGateway {
	return new RealPlanStoreGateway();
}

function direntType(entry: { isFile(): boolean; isDirectory(): boolean }): PlanStorePathType {
	if (entry.isFile()) return "file";
	if (entry.isDirectory()) return "directory";
	return "other";
}

function statsType(pathStat: { isFile(): boolean; isDirectory(): boolean }): PlanStorePathType {
	if (pathStat.isFile()) return "file";
	if (pathStat.isDirectory()) return "directory";
	return "other";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

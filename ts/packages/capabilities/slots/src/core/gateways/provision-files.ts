import { chmod, copyFile, lstat, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { ensurePrivateParentDirectory } from "@nseng-ai/capability-kit/xdg";
import {
	nodeProjectConfigGateway,
	type ProjectConfigGateway,
} from "@nseng-ai/sdk/project-config/points";

export type ProvisionPathKind = "missing" | "file" | "directory" | "symlink" | "other";

export interface SlotProvisionFilesGateway extends ProjectConfigGateway {
	inspect(absolutePath: string): Promise<ProvisionPathKind>;
	contentsEqual(leftPath: string, rightPath: string): Promise<boolean>;
	copyIntoWorktree(storeFilePath: string, worktreeFilePath: string): Promise<void>;
	copyIntoStore(worktreeFilePath: string, storeFilePath: string): Promise<void>;
}

export class RealSlotProvisionFilesGateway implements SlotProvisionFilesGateway {
	readTextFile(request: { repoRoot: string; relativePath: string }) {
		return nodeProjectConfigGateway.readTextFile(request);
	}

	pathExists(request: { repoRoot: string; relativePath: string }) {
		return nodeProjectConfigGateway.pathExists(request);
	}

	async inspect(absolutePath: string): Promise<ProvisionPathKind> {
		let stats;
		try {
			stats = await lstat(absolutePath);
		} catch (error) {
			if (isErrorCode(error, "ENOENT") || isErrorCode(error, "ENOTDIR")) return "missing";
			throw error;
		}
		if (stats.isFile()) return "file";
		if (stats.isDirectory()) return "directory";
		if (stats.isSymbolicLink()) return "symlink";
		return "other";
	}

	async contentsEqual(leftPath: string, rightPath: string): Promise<boolean> {
		const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
		return left.equals(right);
	}

	async copyIntoWorktree(storeFilePath: string, worktreeFilePath: string): Promise<void> {
		await mkdir(dirname(worktreeFilePath), { recursive: true });
		await copyPreservingMode(storeFilePath, worktreeFilePath);
	}

	async copyIntoStore(worktreeFilePath: string, storeFilePath: string): Promise<void> {
		await ensurePrivateParentDirectory(storeFilePath);
		await copyPreservingMode(worktreeFilePath, storeFilePath);
	}
}

async function copyPreservingMode(sourcePath: string, destinationPath: string): Promise<void> {
	const stats = await stat(sourcePath);
	await copyFile(sourcePath, destinationPath);
	// Explicit chmod (not just copyFile mode inheritance) so overwrites also reset
	// a drifted destination mode back to the source mode.
	await chmod(destinationPath, stats.mode & 0o777);
}

function isErrorCode(error: unknown, code: string): boolean {
	if (!(error instanceof Error)) return false;
	return (error as NodeJS.ErrnoException).code === code;
}

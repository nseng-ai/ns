import { mkdir, readdir, readFile, rm, stat, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";

import { runCommand, type CommandRunner } from "@nseng-ai/foundation/exec";
import type { Clock } from "@nseng-ai/foundation/clock";
import { systemClock } from "@nseng-ai/foundation/time";

export interface FileEntry {
	readonly name: string;
	readonly isDirectory: boolean;
	readonly isFile: boolean;
}

export interface FileSystemGateway {
	exists(path: string): Promise<boolean>;
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<void>;
	mkdirp(path: string): Promise<void>;
	rmrf(path: string): Promise<void>;
	copyFile(source: string, destination: string): Promise<void>;
	readDir(path: string): Promise<readonly FileEntry[]>;
	mtimeMs(path: string): Promise<number>;
}

export interface NsDevCliContext {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly homeDir: string;
	readonly runCommand: CommandRunner;
	readonly fs: FileSystemGateway;
	readonly clock: Clock;
	readonly status?: (text: string) => void;
}

export interface NsDevCliDeps {
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly homeDir?: string;
	readonly runCommand?: CommandRunner;
	readonly fs?: FileSystemGateway;
	readonly clock?: Clock;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
}

export function createRealNsDevContext(options: {
	cwd: string;
	env: NodeJS.ProcessEnv;
	homeDir?: string;
	runCommand?: CommandRunner;
	fs?: FileSystemGateway;
	clock?: Clock;
	status?: (text: string) => void;
}): NsDevCliContext {
	return {
		cwd: options.cwd,
		env: options.env,
		homeDir: options.homeDir ?? os.homedir(),
		runCommand: options.runCommand ?? runCommand,
		fs: options.fs ?? realFileSystemGateway,
		clock: options.clock ?? systemClock,
		...(options.status === undefined ? {} : { status: options.status }),
	};
}

export const realFileSystemGateway: FileSystemGateway = {
	async exists(path) {
		try {
			await stat(path);
			return true;
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return false;
			throw error;
		}
	},
	async readText(path) {
		return await readFile(path, "utf8");
	},
	async writeText(path, content) {
		await writeFile(path, content);
	},
	async mkdirp(path) {
		await mkdir(path, { recursive: true });
	},
	async rmrf(path) {
		await rm(path, { recursive: true, force: true });
	},
	async copyFile(source, destination) {
		await copyFile(source, destination);
	},
	async readDir(path) {
		const entries = await readdir(path, { withFileTypes: true });
		return entries.map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
			isFile: entry.isFile(),
		}));
	},
	async mtimeMs(path) {
		return (await stat(path)).mtimeMs;
	},
};

function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

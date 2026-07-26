import {
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";

import type { ClinkrInteraction } from "@nseng-ai/clinkr";
import type { CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import type { Clock } from "@nseng-ai/foundation/clock";
import { runCommand, type CommandRunner } from "@nseng-ai/foundation/exec";
import { isNodeErrorCode } from "@nseng-ai/foundation/primitives";
import { systemClock, systemTimerScheduler } from "@nseng-ai/foundation/time";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import type { ReleaseCliContext } from "./release-public-package-set-cli.ts";
import type { ReleaseResetGateway } from "./release/contracts.ts";

/**
 * Runaway-recursion backstop for filesystem walks of the `ts/packages` tree (symlink loops,
 * pathological nesting). It is not a structural limit on how deep packages may live: raise it
 * freely if the package tree grows, and do not treat it as a layout rule.
 */
export const MAX_PACKAGE_TREE_WALK_DEPTH = 12;

export interface FileEntry {
	readonly name: string;
	readonly isDirectory: boolean;
	readonly isFile: boolean;
	readonly isSymbolicLink: boolean;
}

export interface FileSystemGateway {
	exists(path: string): Promise<boolean>;
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<void>;
	mkdirp(path: string): Promise<void>;
	rmrf(path: string): Promise<void>;
	copyFile(source: string, destination: string): Promise<void>;
	readDir(path: string): Promise<readonly FileEntry[]>;
	realpath(path: string): Promise<string>;
	isDirectory(path: string): Promise<boolean>;
	mkdtemp(prefix: string): Promise<string>;
	mtimeMs(path: string): Promise<number>;
}

export interface NsDevCliContext {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly homeDir: string;
	readonly runCommand: CommandRunner;
	readonly fs: FileSystemGateway;
	readonly clock: Clock;
	readonly timers: TimerScheduler;
	readonly interaction: ClinkrInteraction;
	readonly release?: ReleaseCliContext;
	readonly releaseReset?: ReleaseResetGateway;
	readonly status?: (text: string) => void;
}

export interface NsDevCliDeps extends CliEntrypointDeps {
	readonly homeDir?: string;
	readonly runCommand?: CommandRunner;
	readonly fs?: FileSystemGateway;
	readonly clock?: Clock;
	readonly timers?: TimerScheduler;
	readonly interaction?: ClinkrInteraction;
	readonly stdin?: () => Promise<string | null>;
	readonly release?: ReleaseCliContext;
	readonly releaseReset?: ReleaseResetGateway;
}

export function createRealNsDevContext(options: {
	cwd: string;
	env: NodeJS.ProcessEnv;
	homeDir?: string;
	runCommand?: CommandRunner;
	fs?: FileSystemGateway;
	clock?: Clock;
	timers?: TimerScheduler;
	interaction: ClinkrInteraction;
	release?: ReleaseCliContext;
	releaseReset?: ReleaseResetGateway;
	status?: (text: string) => void;
}): NsDevCliContext {
	return {
		cwd: options.cwd,
		env: options.env,
		homeDir: options.homeDir ?? os.homedir(),
		runCommand: options.runCommand ?? runCommand,
		fs: options.fs ?? realFileSystemGateway,
		clock: options.clock ?? systemClock,
		timers: options.timers ?? systemTimerScheduler,
		interaction: options.interaction,
		...(options.release === undefined ? {} : { release: options.release }),
		...(options.releaseReset === undefined ? {} : { releaseReset: options.releaseReset }),
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
			isSymbolicLink: entry.isSymbolicLink(),
		}));
	},
	async realpath(path) {
		return await realpath(path);
	},
	async isDirectory(path) {
		return (await lstat(path)).isDirectory();
	},
	async mkdtemp(prefix) {
		return await mkdtemp(prefix);
	},
	async mtimeMs(path) {
		return (await stat(path)).mtimeMs;
	},
};

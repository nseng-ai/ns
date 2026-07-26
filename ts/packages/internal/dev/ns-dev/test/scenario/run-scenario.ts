import { dirname, isAbsolute, resolve } from "node:path";

import type { ClinkrInteraction } from "@nseng-ai/clinkr";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import { runNsDevCli, type CliDeps } from "../../src/cli.ts";
import type { FileEntry, FileSystemGateway } from "../../src/context.ts";
import type { ReleaseCliContext } from "../../src/release-public-package-set-cli.ts";
import type { ReleaseResetGateway } from "../../src/release/contracts.ts";

export interface CommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
}

type ExitedExecResult = Extract<ExecResult, { type: "exited" }>;

interface ExitedResultOverrides {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number | null;
	readonly signal?: string | null;
}

export function exitedResult(overrides: ExitedResultOverrides = {}): ExitedExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

export interface ScenarioRunOptions {
	readonly cwd?: string;
	readonly homeDir?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly files?: Record<string, string>;
	readonly directories?: readonly string[];
	readonly existingPaths?: readonly string[];
	readonly mtimes?: Record<string, number>;
	readonly readFailures?: Record<string, string>;
	readonly writeFailures?: Record<string, string>;
	readonly commandResults?: readonly ExecResult[];
	readonly timers?: TimerScheduler;
	readonly interaction?: ClinkrInteraction;
	readonly stdin?: () => Promise<string | null>;
	readonly release?: ReleaseCliContext;
	readonly releaseReset?: ReleaseResetGateway;
}

export interface ScenarioRun {
	readonly exit: Promise<number>;
	readonly stdout: string[];
	readonly stderr: string[];
	readonly calls: CommandCall[];
	readonly fs: FakeFileSystemGateway;
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const calls: CommandCall[] = [];
	const cwd = options.cwd ?? "/repo";
	const homeDir = options.homeDir ?? "/home/tester";
	const fs = new FakeFileSystemGateway({ cwd, ...options });
	const commandResults = [...(options.commandResults ?? [])];
	const deps: CliDeps = {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		homeDir,
		fs,
		clock: { nowMs: () => Date.UTC(2026, 0, 2, 3, 4, 5) },
		...(options.timers === undefined ? {} : { timers: options.timers }),
		...(options.interaction === undefined ? {} : { interaction: options.interaction }),
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		...(options.release === undefined ? {} : { release: options.release }),
		...(options.releaseReset === undefined ? {} : { releaseReset: options.releaseReset }),
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		runCommand: async (command, commandArgs, commandOptions) => {
			calls.push({
				command,
				args: [...commandArgs],
				...(commandOptions?.cwd === undefined ? {} : { cwd: commandOptions.cwd }),
			});
			return commandResults.shift() ?? exitedResult();
		},
	};
	return { exit: runNsDevCli(args, deps), stdout, stderr, calls, fs };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}

export class FakeFileSystemGateway implements FileSystemGateway {
	private readonly cwd: string;
	private readonly files = new Map<string, string>();
	private readonly directories = new Set<string>();
	private readonly mtimes = new Map<string, number>();
	private readonly readFailures = new Map<string, string>();
	private readonly writeFailures = new Map<string, string>();
	readonly removedPaths: string[] = [];
	readonly copiedFiles: { readonly source: string; readonly destination: string }[] = [];
	readonly writtenFiles: { readonly path: string; readonly content: string }[] = [];

	constructor(options: {
		cwd: string;
		files?: Record<string, string>;
		directories?: readonly string[];
		existingPaths?: readonly string[];
		mtimes?: Record<string, number>;
		readFailures?: Record<string, string>;
		writeFailures?: Record<string, string>;
	}) {
		this.cwd = options.cwd;
		this.directories.add("/");
		for (const directory of options.directories ?? []) this.addDirectory(directory);
		for (const path of options.existingPaths ?? []) this.addDirectory(path);
		for (const [path, content] of Object.entries(options.files ?? {})) this.addFile(path, content);
		for (const [path, mtimeMs] of Object.entries(options.mtimes ?? {})) {
			this.mtimes.set(this.normalize(path), mtimeMs);
		}
		for (const [path, message] of Object.entries(options.readFailures ?? {})) {
			this.readFailures.set(this.normalize(path), message);
		}
		for (const [path, message] of Object.entries(options.writeFailures ?? {})) {
			this.writeFailures.set(this.normalize(path), message);
		}
	}

	async exists(path: string): Promise<boolean> {
		const normalized = this.normalize(path);
		return this.files.has(normalized) || this.directories.has(normalized);
	}

	async readText(path: string): Promise<string> {
		const normalized = this.normalize(path);
		const failure = this.readFailures.get(normalized);
		if (failure !== undefined) throw new Error(failure);
		const content = this.files.get(normalized);
		if (content === undefined) throw new Error(`missing file: ${normalized}`);
		return content;
	}

	async writeText(path: string, content: string): Promise<void> {
		const normalized = this.normalize(path);
		const failure = this.writeFailures.get(normalized);
		if (failure !== undefined) throw new Error(failure);
		this.addDirectory(dirname(normalized));
		this.files.set(normalized, content);
		this.writtenFiles.push({ path: normalized, content });
	}

	async mkdirp(path: string): Promise<void> {
		this.addDirectory(path);
	}

	async rmrf(path: string): Promise<void> {
		const normalized = this.normalize(path);
		this.removedPaths.push(normalized);
		for (const file of this.files.keys()) {
			if (file === normalized || file.startsWith(`${normalized}/`)) this.files.delete(file);
		}
		for (const directory of this.directories) {
			if (directory === normalized || directory.startsWith(`${normalized}/`))
				this.directories.delete(directory);
		}
	}

	async copyFile(source: string, destination: string): Promise<void> {
		const normalizedSource = this.normalize(source);
		const normalizedDestination = this.normalize(destination);
		const content = this.files.get(normalizedSource);
		if (content === undefined) throw new Error(`missing file: ${normalizedSource}`);
		this.addFile(normalizedDestination, content);
		this.copiedFiles.push({ source: normalizedSource, destination: normalizedDestination });
	}

	async readDir(path: string): Promise<readonly FileEntry[]> {
		const normalized = this.normalize(path);
		const names = new Map<string, FileEntry>();
		for (const directory of this.directories) {
			if (dirname(directory) === normalized && directory !== normalized) {
				names.set(directoryName(directory), {
					name: directoryName(directory),
					isDirectory: true,
					isFile: false,
					isSymbolicLink: false,
				});
			}
		}
		for (const file of this.files.keys()) {
			if (dirname(file) === normalized) {
				names.set(directoryName(file), {
					name: directoryName(file),
					isDirectory: false,
					isFile: true,
					isSymbolicLink: false,
				});
			}
		}
		return [...names.values()].sort((left, right) => left.name.localeCompare(right.name));
	}

	async realpath(path: string): Promise<string> {
		const normalized = this.normalize(path);
		if (!(await this.exists(normalized))) throw new Error(`missing path: ${normalized}`);
		return normalized;
	}

	async isDirectory(path: string): Promise<boolean> {
		return this.directories.has(this.normalize(path));
	}

	async mkdtemp(prefix: string): Promise<string> {
		const path = `${prefix}fake`;
		this.addDirectory(path);
		return this.normalize(path);
	}

	async mtimeMs(path: string): Promise<number> {
		return this.mtimes.get(this.normalize(path)) ?? Date.UTC(2026, 0, 2, 3, 4, 6);
	}

	private addFile(path: string, content: string): void {
		const normalized = this.normalize(path);
		this.addDirectory(dirname(normalized));
		this.files.set(normalized, content);
	}

	private addDirectory(path: string): void {
		const normalized = this.normalize(path);
		if (this.directories.has(normalized)) return;
		if (normalized !== "/") this.addDirectory(dirname(normalized));
		this.directories.add(normalized);
	}

	private normalize(path: string): string {
		return isAbsolute(path) ? resolve(path) : resolve(this.cwd, path);
	}
}

function directoryName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

import { dirname, isAbsolute, resolve } from "node:path";

import type { ExecResult } from "@nseng-ai/foundation/exec";

import { runNsDevCli, type CliDeps } from "../../src/cli.ts";
import type { FileEntry, FileSystemGateway } from "../../src/context.ts";

export interface CommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
}

export interface ScenarioRunOptions {
	readonly cwd?: string;
	readonly homeDir?: string;
	readonly files?: Record<string, string>;
	readonly directories?: readonly string[];
	readonly existingPaths?: readonly string[];
	readonly mtimes?: Record<string, number>;
	readonly commandResults?: readonly ExecResult[];
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
		env: { PATH: "/fake/bin" },
		homeDir,
		fs,
		clock: { nowMs: () => Date.UTC(2026, 0, 2, 3, 4, 5) },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		runCommand: async (command, commandArgs, commandOptions) => {
			calls.push({
				command,
				args: [...commandArgs],
				...(commandOptions?.cwd === undefined ? {} : { cwd: commandOptions.cwd }),
			});
			return commandResults.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
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
	readonly removedPaths: string[] = [];
	readonly copiedFiles: { readonly source: string; readonly destination: string }[] = [];
	readonly writtenFiles: { readonly path: string; readonly content: string }[] = [];

	constructor(options: {
		cwd: string;
		files?: Record<string, string>;
		directories?: readonly string[];
		existingPaths?: readonly string[];
		mtimes?: Record<string, number>;
	}) {
		this.cwd = options.cwd;
		this.directories.add("/");
		for (const directory of options.directories ?? []) this.addDirectory(directory);
		for (const path of options.existingPaths ?? []) this.addDirectory(path);
		for (const [path, content] of Object.entries(options.files ?? {})) this.addFile(path, content);
		for (const [path, mtimeMs] of Object.entries(options.mtimes ?? {})) {
			this.mtimes.set(this.normalize(path), mtimeMs);
		}
	}

	async exists(path: string): Promise<boolean> {
		const normalized = this.normalize(path);
		return this.files.has(normalized) || this.directories.has(normalized);
	}

	async readText(path: string): Promise<string> {
		const normalized = this.normalize(path);
		const content = this.files.get(normalized);
		if (content === undefined) throw new Error(`missing file: ${normalized}`);
		return content;
	}

	async writeText(path: string, content: string): Promise<void> {
		const normalized = this.normalize(path);
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
				});
			}
		}
		for (const file of this.files.keys()) {
			if (dirname(file) === normalized) {
				names.set(directoryName(file), {
					name: directoryName(file),
					isDirectory: false,
					isFile: true,
				});
			}
		}
		return [...names.values()].sort((left, right) => left.name.localeCompare(right.name));
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

import { isAbsolute, resolve } from "node:path";
import { TextDecoder, TextEncoder } from "node:util";

import { runCli, type CliDeps } from "../../src/cli.ts";
import { type BrmemCliContext } from "../../src/context.ts";
import { brmemError, brmemOk, type BrmemResult } from "../../src/contracts.ts";
import { FakeBrmemGateway, type FakeBrmemGatewayOptions } from "../../src/fake-gateway.ts";
import type { BrmemGateway } from "../../src/gateway.ts";
import type { GitSetupGateway } from "../../src/git-setup-gateway.ts";
import type { BrmemPromptResolver } from "../../src/prompt-resolution.ts";
import type { BrmemSourceReader, SourceBytesResult } from "../../src/source-reader.ts";

export interface ScenarioRunOptions {
	gateway?: BrmemGateway | undefined;
	fake?: FakeBrmemGatewayOptions | undefined;
	gitSetupGateway?: GitSetupGateway | undefined;
	promptResolver?: BrmemPromptResolver | undefined;
	repoRoot?: string | undefined;
	homeRoot?: string | undefined;
	isInGitRepo?: boolean | undefined;
	promptFiles?: readonly string[] | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	cwd?: string | undefined;
	stdin?: string | Uint8Array | (() => Promise<string | Uint8Array>) | undefined;
	files?: Record<string, string | Uint8Array> | undefined;
	unreadableFiles?: Record<string, string> | undefined;
	sourceReader?: BrmemSourceReader | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const stdin = options.stdin;
	const cwd = options.cwd ?? "/repo";
	const context: BrmemCliContext = {
		gateway: options.gateway ?? new FakeBrmemGateway(options.fake),
		gitSetupGateway: options.gitSetupGateway ?? new FakeGitSetupGateway(),
		promptResolver: options.promptResolver ??
			new ScenarioPromptResolver({
				cwd,
				repoRoot: options.repoRoot,
				homeRoot: options.homeRoot,
				isInGitRepo: options.isInGitRepo,
				promptFiles: options.promptFiles,
			}),
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		stdin: async () => stringFromStdin(stdin),
		sourceReader: options.sourceReader ?? new ScenarioSourceReader({ cwd, stdin, files: options.files, unreadableFiles: options.unreadableFiles }),
	};
	const deps: CliDeps = {
		context,
		cwd,
		env: context.env,
		stdin: context.stdin,
		sourceReader: context.sourceReader,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return { exit: runCli(args, deps), stdout, stderr };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}

export interface FakeGitSetupGatewayOptions {
	remotes?: readonly string[] | undefined;
	pushValues?: readonly string[] | undefined;
	fetchValues?: readonly string[] | undefined;
	operationErrors?: Partial<Record<"remote" | "read" | "write", { code: string; message: string }>> | undefined;
}

export interface FakeGitSetupWrite {
	key: string;
	value: string;
}

export class FakeGitSetupGateway implements GitSetupGateway {
	readonly writes: FakeGitSetupWrite[] = [];
	private readonly remotes: ReadonlySet<string>;
	private readonly operationErrors: NonNullable<FakeGitSetupGatewayOptions["operationErrors"]>;
	private readonly valuesByKey: Map<string, string[]>;

	constructor(options: FakeGitSetupGatewayOptions = {}) {
		this.remotes = new Set(options.remotes ?? ["origin"]);
		this.operationErrors = { ...(options.operationErrors ?? {}) };
		this.valuesByKey = new Map([
			["remote.origin.push", [...(options.pushValues ?? [])]],
			["remote.origin.fetch", [...(options.fetchValues ?? ["+refs/heads/*:refs/remotes/origin/*"])]],
		]);
	}

	async remoteExists(remote: string): Promise<BrmemResult<boolean>> {
		const error = this.operationErrors.remote;
		if (error !== undefined) return brmemError(error.code, error.message);
		return brmemOk(this.remotes.has(remote));
	}

	async getConfigValues(key: string): Promise<BrmemResult<readonly string[]>> {
		const error = this.operationErrors.read;
		if (error !== undefined) return brmemError(error.code, error.message);
		return brmemOk([...(this.valuesByKey.get(key) ?? [])]);
	}

	async addConfigValue(key: string, value: string): Promise<BrmemResult<void>> {
		const error = this.operationErrors.write;
		if (error !== undefined) return brmemError(error.code, error.message);
		const values = this.valuesByKey.get(key) ?? [];
		values.push(value);
		this.valuesByKey.set(key, values);
		this.writes.push({ key, value });
		return brmemOk(undefined);
	}

	configValues(key: string): readonly string[] {
		return [...(this.valuesByKey.get(key) ?? [])];
	}
}

class ScenarioPromptResolver implements BrmemPromptResolver {
	private readonly repoRootValue: string;
	private readonly homeRootValue: string;
	private readonly isInGitRepo: boolean;
	private readonly promptFiles: ReadonlySet<string>;

	constructor(options: {
		cwd: string;
		repoRoot?: string | undefined;
		homeRoot?: string | undefined;
		isInGitRepo?: boolean | undefined;
		promptFiles?: readonly string[] | undefined;
	}) {
		this.repoRootValue = options.repoRoot ?? "/repo";
		this.homeRootValue = options.homeRoot ?? "/home/tester";
		this.isInGitRepo = options.isInGitRepo ?? true;
		this.promptFiles = new Set((options.promptFiles ?? []).map((path) => normalizePath(path, options.cwd)));
	}

	async repositoryRoot(options: { cwd: string }): Promise<BrmemResult<string>> {
		if (!this.isInGitRepo) {
			return brmemError(
				"not-a-git-repo",
				`Not inside a git repository: ${options.cwd}. ` +
					"`brmem exec resolve-prompt` requires a git repo to resolve the project-local prompt path; run it from inside a checkout.",
			);
		}
		return brmemOk(this.repoRootValue);
	}

	homeRoot(): string {
		return this.homeRootValue;
	}

	async fileExists(path: string): Promise<boolean> {
		return this.promptFiles.has(normalizePath(path, this.repoRootValue));
	}
}

class ScenarioSourceReader implements BrmemSourceReader {
	private readonly cwd: string;
	private readonly stdin: ScenarioRunOptions["stdin"];
	private readonly files: ReadonlyMap<string, Uint8Array>;
	private readonly unreadableFiles: ReadonlyMap<string, string>;

	constructor(options: {
		cwd: string;
		stdin: ScenarioRunOptions["stdin"];
		files: Record<string, string | Uint8Array> | undefined;
		unreadableFiles: Record<string, string> | undefined;
	}) {
		this.cwd = options.cwd;
		this.stdin = options.stdin;
		this.files = buildByteMap(options.files ?? {}, this.cwd);
		this.unreadableFiles = buildStringMap(options.unreadableFiles ?? {}, this.cwd);
	}

	async readFileBytes(path: string, _options: { cwd: string }): Promise<SourceBytesResult> {
		const key = normalizePath(path, this.cwd);
		const unreadable = this.unreadableFiles.get(key) ?? this.unreadableFiles.get(path);
		if (unreadable !== undefined) return { type: "unreadable", message: unreadable };
		const bytes = this.files.get(key) ?? this.files.get(path);
		if (bytes === undefined) return { type: "missing" };
		return { type: "ok", bytes };
	}

	async readStdinBytes(): Promise<Uint8Array> {
		return bytesFromValue(await valueFromStdin(this.stdin));
	}
}

async function stringFromStdin(stdin: ScenarioRunOptions["stdin"]): Promise<string> {
	const value = await valueFromStdin(stdin);
	return typeof value === "string" ? value : new TextDecoder().decode(value);
}

async function valueFromStdin(stdin: ScenarioRunOptions["stdin"]): Promise<string | Uint8Array> {
	if (typeof stdin === "function") return await stdin();
	return stdin ?? "";
}

function buildByteMap(values: Record<string, string | Uint8Array>, cwd: string): ReadonlyMap<string, Uint8Array> {
	return new Map(Object.entries(values).flatMap(([path, value]) => [[path, bytesFromValue(value)], [normalizePath(path, cwd), bytesFromValue(value)]]));
}

function buildStringMap(values: Record<string, string>, cwd: string): ReadonlyMap<string, string> {
	return new Map(Object.entries(values).flatMap(([path, value]) => [[path, value], [normalizePath(path, cwd), value]]));
}

function normalizePath(path: string, cwd: string): string {
	return isAbsolute(path) ? path : resolve(cwd, path);
}

function bytesFromValue(value: string | Uint8Array): Uint8Array {
	return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
}

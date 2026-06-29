import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";

import type { ExecResult } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import { commandSucceeded, type SdlExtensionApi } from "sdl-sdk";

export interface GitCwdParams {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
}

export interface GitErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo };
export type GitCurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; error: GitErrorInfo };
export type GitOptionalResult<T> =
	| { type: "found"; value: T }
	| { type: "missing" }
	| { type: "error"; error: GitErrorInfo };

export interface GitBranchParams extends GitCwdParams {
	branch: string;
}

export interface GitPathParams extends GitCwdParams {
	relativePath: string;
}

export interface GitRefsPathParams extends GitPathParams {
	refs: readonly string[];
}

export interface GitRevisionRangePathParams extends GitPathParams {
	revisionRange: string;
}

export interface GitLocalBranchTip {
	name: string;
	headIso: string | null;
}

export type GitOperationResult = { ok: true } | { ok: false; error: GitErrorInfo };
export type GitBranchPresenceResult =
	| { type: "present"; refName: string; displayCommand: string }
	| { type: "absent"; refName: string }
	| { type: "error"; error: GitErrorInfo };

export interface GitGateway {
	repoRoot(params: GitCwdParams): Promise<GitResult<string>>;
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult>;
	isInsideWorkTree(params: GitCwdParams): Promise<GitResult<boolean>>;
	trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	headCommit(params: GitCwdParams): Promise<GitResult<string>>;
	gitPath(params: GitPathParams): Promise<GitResult<string>>;
	validateBranchRef(params: GitBranchParams): Promise<GitOperationResult>;
	localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult>;
	createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult>;
	hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>>;
	listLocalBranchTips(params: GitCwdParams): Promise<GitResult<readonly GitLocalBranchTip[]>>;
	treeOidsAtRefs(
		params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>>;
	changedPathsUnder(params: GitRevisionRangePathParams): Promise<GitResult<readonly string[]>>;
}

export interface GitWorktreePorcelainEntry {
	path: string;
	branch: string | null;
}

export type LocalBranchRefreshPlan =
	| {
			type: "pull-checked-out-branch";
			cwd: string;
			args: string[];
	  }
	| {
			type: "fetch-local-branch";
			cwd: string;
			args: string[];
	  };

export interface LocalBranchRefreshPlanOptions {
	branch: string;
	cwd: string;
	worktreePorcelain: string;
}

export function planLocalBranchRefreshFromWorktrees(
	options: LocalBranchRefreshPlanOptions,
): LocalBranchRefreshPlan {
	const checkedOutPath = parseGitWorktreePorcelain(options.worktreePorcelain).find(
		(entry) => entry.branch === options.branch,
	)?.path;
	if (checkedOutPath !== undefined) {
		return {
			type: "pull-checked-out-branch",
			cwd: checkedOutPath,
			args: ["pull", "--ff-only", "origin", options.branch],
		};
	}

	return {
		type: "fetch-local-branch",
		cwd: options.cwd,
		args: ["fetch", "origin", `refs/heads/${options.branch}:refs/heads/${options.branch}`],
	};
}

export function parseGitWorktreePorcelain(stdout: string): GitWorktreePorcelainEntry[] {
	const entries: GitWorktreePorcelainEntry[] = [];
	let current: GitWorktreePorcelainEntry | null = null;

	function pushCurrent(): void {
		if (current !== null) entries.push(current);
		current = null;
	}

	for (const line of stdout.split("\n")) {
		if (line.length === 0) {
			pushCurrent();
			continue;
		}
		if (line.startsWith("worktree ")) {
			pushCurrent();
			current = { path: line.slice("worktree ".length), branch: null };
			continue;
		}
		if (current !== null && line.startsWith("branch ")) {
			const ref = line.slice("branch ".length);
			current = {
				...current,
				branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref,
			};
		}
	}
	pushCurrent();
	return entries;
}

const HEADS_REF_PREFIX = "refs/heads/";

export type LocalBranchRefReadResult =
	| { ok: true; branches: ReadonlySet<string> }
	| {
			ok: false;
			reason: "branch-ref-read-failed";
			message: string;
			path: string;
			error: unknown;
	  };

export interface LocalBranchRefDirent {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
}

export interface LocalBranchRefReaderFs {
	readdir(path: string): readonly LocalBranchRefDirent[];
	readFile(path: string): string;
}

export interface ReadLocalBranchRefsOptions {
	fs?: LocalBranchRefReaderFs | undefined;
}

const nodeBranchRefReaderFs: LocalBranchRefReaderFs = {
	readdir(path) {
		return readdirSync(path, { withFileTypes: true }) satisfies Dirent[];
	},
	readFile(path) {
		return readFileSync(path, "utf8");
	},
};

export function readLocalBranchRefs(
	commonGitDir: string,
	options: ReadLocalBranchRefsOptions = {},
): LocalBranchRefReadResult {
	const fs = options.fs ?? nodeBranchRefReaderFs;
	const looseResult = collectLooseBranchRefs({
		fs,
		dir: join(commonGitDir, "refs", "heads"),
		prefix: [],
		shouldAllowMissingDir: true,
	});
	if (!looseResult.ok) return looseResult;

	const packedResult = collectPackedBranchRefs({
		fs,
		packedRefsPath: join(commonGitDir, "packed-refs"),
	});
	if (!packedResult.ok) return packedResult;

	return { ok: true, branches: new Set([...looseResult.branches, ...packedResult.branches]) };
}

type BranchRefCollectResult =
	| Exclude<LocalBranchRefReadResult, { ok: true }>
	| { ok: true; branches: readonly string[] };

interface CollectLooseBranchRefsOptions {
	fs: LocalBranchRefReaderFs;
	dir: string;
	prefix: readonly string[];
	shouldAllowMissingDir: boolean;
}

function collectLooseBranchRefs(options: CollectLooseBranchRefsOptions): BranchRefCollectResult {
	let entries: readonly LocalBranchRefDirent[];
	try {
		entries = options.fs.readdir(options.dir);
	} catch (error) {
		if (options.shouldAllowMissingDir && isErrorCode(error, "ENOENT"))
			return { ok: true, branches: [] };
		return readFailed(options.dir, error);
	}

	const branches: string[] = [];
	for (const entry of entries) {
		const segments = [...options.prefix, entry.name];
		if (entry.isDirectory()) {
			const result = collectLooseBranchRefs({
				fs: options.fs,
				dir: join(options.dir, entry.name),
				prefix: segments,
				shouldAllowMissingDir: false,
			});
			if (!result.ok) return result;
			branches.push(...result.branches);
		} else if (entry.isFile()) {
			branches.push(segments.join("/"));
		}
	}
	return { ok: true, branches };
}

interface CollectPackedBranchRefsOptions {
	fs: LocalBranchRefReaderFs;
	packedRefsPath: string;
}

function collectPackedBranchRefs(options: CollectPackedBranchRefsOptions): BranchRefCollectResult {
	let content: string;
	try {
		content = options.fs.readFile(options.packedRefsPath);
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { ok: true, branches: [] };
		return readFailed(options.packedRefsPath, error);
	}

	const branches: string[] = [];
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("^")) continue;
		const fields = trimmed.split(/\s+/);
		const refName = fields[1];
		if (refName?.startsWith(HEADS_REF_PREFIX)) {
			branches.push(refName.slice(HEADS_REF_PREFIX.length));
		}
	}
	return { ok: true, branches };
}

function readFailed(path: string, error: unknown): Exclude<LocalBranchRefReadResult, { ok: true }> {
	return {
		ok: false,
		reason: "branch-ref-read-failed",
		message: `Could not read local branch refs at ${path}: ${formatErrorMessage(error)}`,
		path,
		error,
	};
}

function isErrorCode(error: unknown, code: string): boolean {
	if (!(error instanceof Error)) return false;
	return (error as NodeJS.ErrnoException).code === code;
}

export type SdlGitPorcelainStatusResult =
	| { ok: true; isClean: boolean; stdout: string; result: ExecResult }
	| { ok: false; result: ExecResult };

export interface ExecSdlCommandOptions {
	ctx: SdlExtensionApi;
	command: string;
	args: readonly string[];
	cwd?: string | undefined;
	timeoutMs?: number | undefined;
	onStdout?: ((text: string) => void) | undefined;
	onStderr?: ((text: string) => void) | undefined;
}

interface CliExecOptions {
	cwd?: string | undefined;
	timeout?: number | undefined;
}

interface SdlCliExecAdapterOptions {
	ctx: SdlExtensionApi;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
}

export async function execSdlCommand(options: ExecSdlCommandOptions): Promise<ExecResult> {
	if (options.cwd !== undefined && options.cwd !== options.ctx.cwd) {
		return {
			code: 2,
			stdout: "",
			stderr: `SDL command execution is scoped to ${options.ctx.cwd}; refusing command cwd ${options.cwd}.`,
			killed: false,
		};
	}
	const execOptions = {
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
	return Object.keys(execOptions).length === 0
		? await options.ctx.exec(options.command, [...options.args])
		: await options.ctx.exec(options.command, [...options.args], execOptions);
}

export function createSdlCliExecAdapter(options: SdlCliExecAdapterOptions) {
	return async (command: string, args: string[], execOptions?: CliExecOptions) =>
		await execSdlCommand({
			ctx: options.ctx,
			command,
			args,
			...(execOptions?.cwd === undefined ? {} : { cwd: execOptions.cwd }),
			...(execOptions?.timeout === undefined ? {} : { timeoutMs: execOptions.timeout }),
			...(options.onOutput === undefined
				? {}
				: {
						onStdout: (text: string) => options.onOutput?.("stdout", text),
						onStderr: (text: string) => options.onOutput?.("stderr", text),
					}),
		});
}

export async function execSdlGit(
	ctx: SdlExtensionApi,
	args: readonly string[],
	timeoutMs?: number,
): Promise<ExecResult> {
	return await execSdlCommand({
		ctx,
		command: "git",
		args,
		...(timeoutMs === undefined ? {} : { timeoutMs }),
	});
}

export async function readSdlGitPorcelainStatus(
	ctx: SdlExtensionApi,
	timeoutMs?: number,
): Promise<SdlGitPorcelainStatusResult> {
	const result = await execSdlGit(ctx, ["status", "--porcelain"], timeoutMs);
	if (!commandSucceeded(result)) return { ok: false, result };

	const stdout = result.stdout;
	return { ok: true, isClean: stdout.trim().length === 0, stdout, result };
}

import { type ExecResult, formatCommandResultFailure, normalizeExecResult } from "@sdl/exec";
import type {
	ThermoCouncilCommandContext,
	ThermoCouncilExtensionAPI,
	ScopeResult,
	ScopeResultFailed,
} from "./types.ts";
import {
	DIFF_PROMPT_LIMIT_CHARS,
	DIFF_TIMEOUT_MS,
	GIT_TIMEOUT_MS,
	RUBRIC_REF,
} from "./constants.ts";

interface GitOptions {
	readonly pi: ThermoCouncilExtensionAPI;
	readonly ctx: ThermoCouncilCommandContext;
	readonly args: readonly string[];
	readonly timeoutMs: number;
}

interface LoadedGitResult {
	readonly type: "loaded";
	readonly stdout: string;
	readonly stderr: string;
}

interface ProbeGitFailure {
	readonly type: "failed";
	readonly result: {
		readonly code: number;
		readonly stdout: string;
		readonly stderr: string;
		readonly args: readonly string[];
	};
}

type ProbeGitResult = LoadedGitResult | ProbeGitFailure;

export async function collectThermoCouncilScope(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
): Promise<ScopeResult> {
	const status = await git({ pi, ctx, args: ["status", "--short"], timeoutMs: GIT_TIMEOUT_MS });
	if (status.type === "failed") return status;
	if (status.stdout.trim() !== "") {
		return {
			type: "failed",
			message: `Dirty worktree; refusing ambiguous review scope.\n\n${status.stdout.trim()}`,
		};
	}

	const cwdResult = await git({
		pi,
		ctx,
		args: ["rev-parse", "--show-toplevel"],
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (cwdResult.type === "failed") return cwdResult;
	const headSha = await git({ pi, ctx, args: ["rev-parse", "HEAD"], timeoutMs: GIT_TIMEOUT_MS });
	if (headSha.type === "failed") return headSha;
	const baseRefResult = await inferBaseRef(pi, ctx);
	if (typeof baseRefResult !== "string") return baseRefResult;
	const baseCommit = await git({
		pi,
		ctx,
		args: ["rev-parse", "--verify", `${baseRefResult}^{commit}`],
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (baseCommit.type === "failed") return baseCommit;
	const mergeBase = await git({
		pi,
		ctx,
		args: ["merge-base", baseCommit.stdout.trim(), "HEAD"],
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (mergeBase.type === "failed") return mergeBase;
	const baseSha = mergeBase.stdout.trim();
	const diffStat = await git({
		pi,
		ctx,
		args: ["diff", "--stat", `${baseSha}...HEAD`],
		timeoutMs: DIFF_TIMEOUT_MS,
	});
	if (diffStat.type === "failed") return diffStat;
	const changedFileResult = await git({
		pi,
		ctx,
		args: ["diff", "--name-only", `${baseSha}...HEAD`],
		timeoutMs: DIFF_TIMEOUT_MS,
	});
	if (changedFileResult.type === "failed") return changedFileResult;
	const changedFiles = changedFileResult.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (changedFiles.length === 0) {
		return { type: "failed", message: `No reviewable changes between ${baseRefResult} and HEAD.` };
	}
	const diff = await git({
		pi,
		ctx,
		args: ["diff", "--no-ext-diff", `${baseSha}...HEAD`],
		timeoutMs: DIFF_TIMEOUT_MS,
	});
	if (diff.type === "failed") return diff;
	const rubric = await git({ pi, ctx, args: ["show", RUBRIC_REF], timeoutMs: GIT_TIMEOUT_MS });
	if (rubric.type === "failed") return rubric;
	const diffText =
		diff.stdout.length > DIFF_PROMPT_LIMIT_CHARS
			? `${diff.stdout.slice(0, DIFF_PROMPT_LIMIT_CHARS)}\n\n[diff truncated by /thermo-council]`
			: diff.stdout;
	return {
		type: "loaded",
		scope: {
			cwd: cwdResult.stdout.trim(),
			baseRef: baseRefResult,
			baseSha,
			headRef: "HEAD",
			headSha: headSha.stdout.trim(),
			diffStat: diffStat.stdout.trim(),
			changedFiles,
			diffText,
			isDiffTruncated: diff.stdout.length > DIFF_PROMPT_LIMIT_CHARS,
			rubricText: rubric.stdout,
		},
	};
}

async function inferBaseRef(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
): Promise<string | ScopeResultFailed> {
	const originHead = await probeGit({
		pi,
		ctx,
		args: ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (originHead.type === "loaded" && originHead.stdout.trim() !== "")
		return originHead.stdout.trim();
	for (const candidate of ["origin/master", "origin/main", "master", "main"] as const) {
		const result = await probeGit({
			pi,
			ctx,
			args: ["rev-parse", "--verify", `${candidate}^{commit}`],
			timeoutMs: GIT_TIMEOUT_MS,
		});
		if (result.type === "loaded") return candidate;
	}
	return {
		type: "failed",
		message:
			"Could not infer a review base from origin/HEAD, origin/master, origin/main, master, or main. /thermo-council infers scope from the current checkout and does not accept an explicit base-ref argument.",
	};
}

async function git(options: GitOptions): Promise<LoadedGitResult | ScopeResultFailed> {
	const result = await execGit(options);
	if (result.code === 0) return { type: "loaded", stdout: result.stdout, stderr: result.stderr };
	return {
		type: "failed",
		message: formatCommandResultFailure("git command failed", "git", options.args, result),
	};
}

async function probeGit(options: GitOptions): Promise<ProbeGitResult> {
	const result = await execGit(options);
	if (result.code === 0) return { type: "loaded", stdout: result.stdout, stderr: result.stderr };
	return {
		type: "failed",
		result: {
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
			args: [...options.args],
		},
	};
}

async function execGit({ pi, ctx, args, timeoutMs }: GitOptions): Promise<ExecResult> {
	return execCommand(pi, ctx, "git", args, timeoutMs);
}

async function execCommand(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	command: string,
	args: readonly string[],
	timeoutMs: number,
): Promise<ExecResult> {
	return normalizeExecResult(
		await pi.exec(command, args, {
			cwd: ctx.cwd,
			timeout: timeoutMs,
			...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
		}),
	);
}

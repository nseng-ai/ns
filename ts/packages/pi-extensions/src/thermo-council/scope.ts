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

export async function collectThermoCouncilScope(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
): Promise<ScopeResult> {
	const baseArg = parseBaseArg(args);
	if (baseArg.type === "failed") return baseArg;

	const status = await git(pi, ctx, ["status", "--short"], GIT_TIMEOUT_MS);
	if (status.type === "failed") return status;
	if (status.stdout.trim() !== "") {
		return {
			type: "failed",
			message: `Dirty worktree; refusing ambiguous review scope.\n\n${status.stdout.trim()}`,
		};
	}

	const cwdResult = await git(pi, ctx, ["rev-parse", "--show-toplevel"], GIT_TIMEOUT_MS);
	if (cwdResult.type === "failed") return cwdResult;
	const headSha = await git(pi, ctx, ["rev-parse", "HEAD"], GIT_TIMEOUT_MS);
	if (headSha.type === "failed") return headSha;
	const baseRefResult = baseArg.baseRef ?? (await inferBaseRef(pi, ctx));
	if (typeof baseRefResult !== "string") return baseRefResult;
	const baseCommit = await git(
		pi,
		ctx,
		["rev-parse", "--verify", `${baseRefResult}^{commit}`],
		GIT_TIMEOUT_MS,
	);
	if (baseCommit.type === "failed") return baseCommit;
	const mergeBase = await git(
		pi,
		ctx,
		["merge-base", baseCommit.stdout.trim(), "HEAD"],
		GIT_TIMEOUT_MS,
	);
	if (mergeBase.type === "failed") return mergeBase;
	const baseSha = mergeBase.stdout.trim();
	const diffStat = await git(pi, ctx, ["diff", "--stat", `${baseSha}...HEAD`], DIFF_TIMEOUT_MS);
	if (diffStat.type === "failed") return diffStat;
	const changedFileResult = await git(
		pi,
		ctx,
		["diff", "--name-only", `${baseSha}...HEAD`],
		DIFF_TIMEOUT_MS,
	);
	if (changedFileResult.type === "failed") return changedFileResult;
	const changedFiles = changedFileResult.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (changedFiles.length === 0) {
		return { type: "failed", message: `No reviewable changes between ${baseRefResult} and HEAD.` };
	}
	const diff = await git(pi, ctx, ["diff", "--no-ext-diff", `${baseSha}...HEAD`], DIFF_TIMEOUT_MS);
	if (diff.type === "failed") return diff;
	const rubric = await git(pi, ctx, ["show", RUBRIC_REF], GIT_TIMEOUT_MS);
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
			diffTruncated: diff.stdout.length > DIFF_PROMPT_LIMIT_CHARS,
			rubricText: rubric.stdout,
		},
	};
}

function parseBaseArg(
	args: string,
): { readonly type: "loaded"; readonly baseRef?: string } | ScopeResultFailed {
	const trimmed = args.trim();
	if (trimmed.length === 0) return { type: "loaded" };
	if (/\s/.test(trimmed)) {
		return {
			type: "failed",
			message:
				"Ambiguous /thermo-council argument. Pass a single base ref, or omit the argument for automatic base inference.",
		};
	}
	return { type: "loaded", baseRef: trimmed };
}

async function inferBaseRef(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
): Promise<string | ScopeResultFailed> {
	const originHead = await git(
		pi,
		ctx,
		["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		GIT_TIMEOUT_MS,
		{
			allowFailure: true,
		},
	);
	if (originHead.type === "loaded" && originHead.stdout.trim() !== "")
		return originHead.stdout.trim();
	for (const candidate of ["origin/master", "origin/main", "master", "main"] as const) {
		const result = await git(
			pi,
			ctx,
			["rev-parse", "--verify", `${candidate}^{commit}`],
			GIT_TIMEOUT_MS,
			{
				allowFailure: true,
			},
		);
		if (result.type === "loaded") return candidate;
	}
	return {
		type: "failed",
		message:
			"Could not infer a review base from origin/HEAD, origin/master, origin/main, master, or main. Pass an explicit base ref.",
	};
}

async function git(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: readonly string[],
	timeout: number,
	options: { readonly allowFailure?: boolean } = {},
): Promise<
	{ readonly type: "loaded"; readonly stdout: string; readonly stderr: string } | ScopeResultFailed
> {
	const result = await pi.exec("git", args, {
		cwd: ctx.cwd,
		timeout,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
	});
	if (result.code === 0) return { type: "loaded", stdout: result.stdout, stderr: result.stderr };
	if (options.allowFailure === true) return { type: "failed", message: "allowed git failure" };
	return {
		type: "failed",
		message: `git ${args.join(" ")} failed with exit ${result.code}${result.killed === true ? " (killed)" : ""}.\nstdout:\n${bounded(result.stdout)}\nstderr:\n${bounded(result.stderr)}`,
	};
}

function bounded(value: string): string {
	const limit = 4_000;
	return value.length <= limit ? value : `${value.slice(0, limit)}\n[truncated]`;
}

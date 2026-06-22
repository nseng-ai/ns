import { formatCommandResultFailure, normalizeExecResult, type ExecResult } from "@sdl/core/exec";
import { DEFAULT_FAST_MODEL, DEFAULT_FAST_MODEL_REF, resolveModelRef } from "@sdl/plans";

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
	args: string,
): Promise<ScopeResult> {
	const baseArg = await interpretBaseArg(pi, ctx, args);
	if (baseArg.type === "failed") return baseArg;

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
	const baseRefResult = baseArg.baseRef ?? (await inferBaseRef(pi, ctx));
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

type BaseArgResult = { readonly type: "loaded"; readonly baseRef?: string } | ScopeResultFailed;

type ScopePromptInterpretation =
	| { readonly type: "automatic-base" }
	| { readonly type: "base-ref"; readonly baseRef: string }
	| { readonly type: "unsupported"; readonly reason: string };

const SCOPE_MODEL_ENV = "THERMO_COUNCIL_SCOPE_MODEL";
const SCOPE_MODEL_TIMEOUT_MS = 60_000;
const SCOPE_INTERPRETER_SYSTEM_PROMPT = `Interpret the argument to a /thermo-council code review command.

Return only compact JSON with one of these exact shapes:
{"type":"automatic-base"}
{"type":"base-ref","baseRef":"<single git revision token>"}
{"type":"unsupported","reason":"<short reason>"}

Semantics:
- automatic-base means review the current branch/stack against the command's inferred repository base.
- base-ref means the user identified a specific git base ref/revision to review HEAD against.
- unsupported means the argument asks for anything outside choosing review scope/base.

Rules:
- Natural-language requests such as reviewing the current stack, whole stack, entire stack, or all changes in this stack should be automatic-base.
- If the prompt explicitly says to compare against a named ref, return base-ref.
- The baseRef must be a single token with no whitespace and must not start with "-".
- Do not invent branch names. If no explicit ref is present, prefer automatic-base for stack/current-change scope requests.
- Do not include Markdown, prose outside JSON, or extra keys.`;

async function interpretBaseArg(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
): Promise<BaseArgResult> {
	const trimmed = args.trim();
	if (trimmed.length === 0) return { type: "loaded" };
	if (!/\s/.test(trimmed)) return { type: "loaded", baseRef: trimmed };
	const interpreted = await interpretScopePromptWithModel(pi, ctx, trimmed);
	if (interpreted.type === "failed") return interpreted;
	return baseArgFromScopePromptInterpretation(trimmed, interpreted.interpretation);
}

async function interpretScopePromptWithModel(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	prompt: string,
): Promise<
	| { readonly type: "loaded"; readonly interpretation: ScopePromptInterpretation }
	| ScopeResultFailed
> {
	const resolution = resolveModelRef(process.env, SCOPE_MODEL_ENV, DEFAULT_FAST_MODEL_REF);
	if (!resolution.ok) return { type: "failed", message: resolution.error };
	const model = resolution.value;
	const result = await execPi(pi, ctx, buildScopeModelArgs(prompt, model), SCOPE_MODEL_TIMEOUT_MS);
	if (result.code !== 0 || result.killed === true) {
		return {
			type: "failed",
			message: formatCommandResultFailure(
				"/thermo-council scope model failed",
				"pi",
				buildScopeModelDisplayArgs(model),
				result,
			),
		};
	}
	const parsed = parseScopePromptInterpretation(result.stdout);
	if (parsed.type === "failed") return parsed;
	return { type: "loaded", interpretation: parsed.interpretation };
}

function baseArgFromScopePromptInterpretation(
	prompt: string,
	interpretation: ScopePromptInterpretation,
): BaseArgResult {
	switch (interpretation.type) {
		case "automatic-base":
			return { type: "loaded" };
		case "base-ref":
			if (!isValidBaseRefToken(interpretation.baseRef)) {
				return {
					type: "failed",
					message: `Scope model returned an invalid base ref for /thermo-council: ${interpretation.baseRef}`,
				};
			}
			return { type: "loaded", baseRef: interpretation.baseRef };
		case "unsupported":
			return {
				type: "failed",
				message: [
					`Unsupported /thermo-council scope prompt: ${prompt}`,
					interpretation.reason,
					"Ask for a review scope/base, pass a single base ref, or omit the argument for automatic base inference.",
				].join("\n"),
			};
	}
}

function parseScopePromptInterpretation(
	output: string,
):
	| { readonly type: "loaded"; readonly interpretation: ScopePromptInterpretation }
	| ScopeResultFailed {
	let value: unknown;
	try {
		value = JSON.parse(output.trim());
	} catch {
		return {
			type: "failed",
			message: `Scope model returned non-JSON output for /thermo-council: ${output.trim()}`,
		};
	}
	if (!isRecord(value) || typeof value.type !== "string") {
		return { type: "failed", message: "Scope model returned malformed JSON for /thermo-council." };
	}
	if (value.type === "automatic-base")
		return { type: "loaded", interpretation: { type: value.type } };
	if (value.type === "base-ref" && typeof value.baseRef === "string") {
		return {
			type: "loaded",
			interpretation: { type: value.type, baseRef: value.baseRef.trim() },
		};
	}
	if (value.type === "unsupported" && typeof value.reason === "string") {
		return {
			type: "loaded",
			interpretation: { type: value.type, reason: value.reason.trim() },
		};
	}
	return { type: "failed", message: "Scope model returned unsupported JSON for /thermo-council." };
}

function buildScopeModelArgs(
	prompt: string,
	model: { readonly provider: string; readonly modelId: string } = DEFAULT_FAST_MODEL,
): string[] {
	return [
		"--provider",
		model.provider,
		"--model",
		model.modelId,
		"--thinking",
		"minimal",
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-tools",
		"--mode",
		"text",
		"--print",
		`${SCOPE_INTERPRETER_SYSTEM_PROMPT}\n\nArgument:\n${JSON.stringify(prompt)}`,
	];
}

function buildScopeModelDisplayArgs(model: {
	readonly provider: string;
	readonly modelId: string;
}): string[] {
	return buildScopeModelArgs("<scope-prompt>", model);
}

function isValidBaseRefToken(value: string): boolean {
	return value.length > 0 && !value.startsWith("-") && !/\s/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
			"Could not infer a review base from origin/HEAD, origin/master, origin/main, master, or main. Pass an explicit base ref.",
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

async function execPi(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: readonly string[],
	timeoutMs: number,
): Promise<ExecResult> {
	return execCommand(pi, ctx, "pi", args, timeoutMs);
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

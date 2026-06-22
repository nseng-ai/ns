import { z } from "zod";

import type { ModelInfo } from "./cmux/types.ts";
import { definePiSurfaceParity } from "./parity.ts";
import {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	blockThermoCouncilReviewTool,
	blockedReviewSchema,
	reviewSchema,
	submitThermoCouncilReviewTool,
	type FindingConfidence,
	type FindingSeverity,
	type ThermoCouncilFinding,
	type ThermoCouncilReview,
	type ThermoCouncilReviewerOutcome,
	type ThermoCouncilScope,
	type ThermoCouncilSeatConfig,
	type ThermoCouncilSeatId,
	type ThermoCouncilSeatStatus,
} from "./thermo-council-contract.ts";
import {
	dispatchRunnerSubagent,
	type JsonObject,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "./runner-subagent.ts";

export {
	BLOCK_THERMO_COUNCIL_REVIEW_TOOL,
	SUBMIT_THERMO_COUNCIL_REVIEW_TOOL,
	blockThermoCouncilReviewTool,
	submitThermoCouncilReviewTool,
} from "./thermo-council-contract.ts";
export type {
	FindingConfidence,
	FindingSeverity,
	ThermoCouncilFinding,
	ThermoCouncilReview,
	ThermoCouncilReviewerOutcome,
	ThermoCouncilScope,
	ThermoCouncilSeatConfig,
	ThermoCouncilSeatId,
	ThermoCouncilSeatStatus,
} from "./thermo-council-contract.ts";

export const THERMO_COUNCIL_COMMAND_NAME = "thermo-council";
export const THERMO_COUNCIL_MESSAGE_TYPE = "thermo-council-report";

const STATUS_KEY = THERMO_COUNCIL_COMMAND_NAME;
const GIT_TIMEOUT_MS = 30_000;
const DIFF_TIMEOUT_MS = 60_000;
const DIFF_PROMPT_LIMIT_CHARS = 80_000;
const RUBRIC_REF = "HEAD:reviews/thermonuclear-review.md";
const SAFETY_NOTE =
	"No branches were created, no commits were made, no Branch Memory entries were written, no repo report files were written, and no remotes were mutated by /thermo-council.";

const DEFAULT_SEATS = [
	{
		id: "anthropic-opus",
		label: "Anthropic Opus",
		model: "anthropic/claude-opus-4-1",
		envVar: "THERMO_COUNCIL_ANTHROPIC_MODEL",
	},
	{
		id: "openai-high",
		label: "OpenAI High",
		model: "openai/gpt-5",
		envVar: "THERMO_COUNCIL_OPENAI_MODEL",
	},
	{
		id: "gemini-high",
		label: "Gemini High",
		model: "google/gemini-2.5-pro",
		envVar: "THERMO_COUNCIL_GEMINI_MODEL",
	},
] as const satisfies readonly DefaultSeat[];

export const thermoCouncilParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: THERMO_COUNCIL_COMMAND_NAME,
		workflow:
			"Run a Pi-native multi-model thermonuclear review council and present a session-local synthesized report",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents should run the portable thermonuclear review rubric directly from reviews/thermonuclear-review.md or use the Thermostack skill for a single-agent review/branch proposal workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "thermo-council",
		notes:
			"The command is Pi-specific because it orchestrates multiple Pi runner subagents, model refs, terminal capture tools, and session-local presentation.",
	},
] as const);

interface DefaultSeat {
	readonly id: ThermoCouncilSeatId;
	readonly label: string;
	readonly model: string;
	readonly envVar: string;
}

interface ExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
	readonly killed?: boolean;
}

interface ExecOptions {
	readonly cwd?: string;
	readonly timeout?: number;
	readonly signal?: AbortSignal;
}

interface ThermoCouncilExtensionAPI extends RunnerSubagentPi {
	registerCommand(name: string, command: RegisteredCommand): void;
	sendMessage?(message: CustomMessage): void | Promise<void>;
	exec(command: string, args: readonly string[], options?: ExecOptions): Promise<ExecResult>;
}

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: ThermoCouncilCommandContext): Promise<void> | void;
}

interface ThermoCouncilCommandContext {
	readonly cwd: string;
	readonly signal?: AbortSignal;
	readonly model?: ModelInfo;
	readonly hasUI?: boolean;
	readonly ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle?(): Promise<void>;
}

interface CustomMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly details?: unknown;
}

interface EnvReader {
	readonly get: (name: string) => string | undefined;
}

interface ScopeResultLoaded {
	readonly type: "loaded";
	readonly scope: ThermoCouncilScope;
}

interface ScopeResultFailed {
	readonly type: "failed";
	readonly message: string;
}

type ScopeResult = ScopeResultLoaded | ScopeResultFailed;

interface FlatFinding {
	readonly seat: ThermoCouncilSeatConfig;
	readonly finding: ThermoCouncilFinding;
}

interface FindingCluster {
	readonly title: string;
	readonly files: readonly string[];
	readonly support: readonly ThermoCouncilSeatConfig[];
	readonly findings: readonly FlatFinding[];
	readonly severity: FindingSeverity;
	readonly confidence: FindingConfidence;
	readonly rankScore: number;
}

export default function thermoCouncilExtension(pi: ThermoCouncilExtensionAPI): void {
	pi.registerCommand(THERMO_COUNCIL_COMMAND_NAME, {
		description:
			"Run a multi-model thermonuclear review council and present one session-local report",
		argumentHint: "[base-ref]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runThermoCouncilCommand(pi, ctx, args);
		},
	});
}

export async function runThermoCouncilCommand(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	args: string,
): Promise<void> {
	setStatus(ctx, "preflighting review scope…");
	try {
		const scopeResult = await collectThermoCouncilScope(pi, ctx, args);
		if (scopeResult.type === "failed") {
			emitReport(pi, ctx, renderFatalReport(scopeResult.message));
			return;
		}

		const seats = parseThermoCouncilSeats(processEnvReader());
		setStatus(ctx, `launching ${seats.length} council seats…`);
		const outcomes = await Promise.all(
			seats.map((seat) => launchThermoCouncilReviewer(pi, ctx, scopeResult.scope, seat)),
		);
		setStatus(ctx, "synthesizing thermo council report…");
		const report = renderThermoCouncilReport(scopeResult.scope, outcomes);
		emitReport(pi, ctx, report);
	} catch (error) {
		emitReport(
			pi,
			ctx,
			renderFatalReport(`Unexpected /thermo-council failure: ${errorMessage(error)}`),
		);
	} finally {
		setStatus(ctx, undefined);
	}
}

export function parseThermoCouncilSeats(env: EnvReader): readonly ThermoCouncilSeatConfig[] {
	const positionalModels = parsePositionalModels(env.get("THERMO_COUNCIL_MODELS"));
	return DEFAULT_SEATS.map((seat, index) => ({
		id: seat.id,
		label: seat.label,
		model: modelOverride(env.get(seat.envVar), positionalModels[index], seat.model, seat.label),
	}));
}

export function buildReviewerPrompt(
	scope: ThermoCouncilScope,
	seat: ThermoCouncilSeatConfig,
): string {
	const diffNotice = scope.diffTruncated
		? `The diff below was truncated to ${DIFF_PROMPT_LIMIT_CHARS} characters. Use the read tool for focused nearby context from changed files only.`
		: "The full git diff is included below.";
	return [
		`You are the ${seat.label} seat in /thermo-council.`,
		"",
		"Run an independent thermonuclear maintainability review. This is report-only: do not create branches, edit files, write files, commit, push, call remotes, or mutate Branch Memory.",
		"You have a mechanically restricted tool allowlist. Use read only for focused nearby context from paths in the changed-file list. Finish by calling exactly one terminal capture tool: submit_thermo_council_review or block_thermo_council_review.",
		"",
		"## Scope",
		`- Working directory: ${scope.cwd}`,
		`- Base: ${scope.baseRef} (${scope.baseSha})`,
		`- Head: ${scope.headRef} (${scope.headSha})`,
		"",
		"## Diff Stat",
		codeFence(scope.diffStat),
		"",
		"## Changed Files",
		...scope.changedFiles.map((file) => `- ${file}`),
		"",
		"## Canonical Rubric: reviews/thermonuclear-review.md",
		codeFence(scope.rubricText),
		"",
		"## Diff",
		diffNotice,
		codeFence(scope.diffText),
		"",
		"## Terminal capture contract",
		"Call submit_thermo_council_review with findings shaped as:",
		codeFence(`{
  "summary": "short synthesis",
  "findings": [{
    "id": "local-id",
    "title": "finding title",
    "files": ["path.ts"],
    "evidence": "specific diff/context evidence",
    "problem": "maintainability problem",
    "proposedFix": "concrete remediation",
    "behaviorRisk": "risk of the current implementation or the fix",
    "dependencyNotes": "ordering or dependency notes, or 'None'",
    "confidence": "trunk-likely | likely | uncertain | speculative",
    "severity": "critical | high | medium | low",
    "validationHints": ["focused validation command or check"]
  }],
  "disagreements": ["optional concerns about tensions or incompatible remedies"]
}`),
		"If blocked, call block_thermo_council_review with a reason and suggested recovery.",
	].join("\n");
}

async function launchThermoCouncilReviewer(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	scope: ThermoCouncilScope,
	seat: ThermoCouncilSeatConfig,
): Promise<ThermoCouncilReviewerOutcome> {
	const runnerCtx: RunnerSubagentContext = {
		cwd: ctx.cwd,
		...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
		...(ctx.model === undefined ? {} : { model: ctx.model }),
	};
	const result = await dispatchRunnerSubagent<JsonObject>(pi, runnerCtx, {
		title: `Thermo council: ${seat.label}`,
		model: seat.model,
		prompt: buildReviewerPrompt(scope, seat),
		returnMode: "terminal",
		terminalTools: [submitThermoCouncilReviewTool, blockThermoCouncilReviewTool],
		tools: ["read", SUBMIT_THERMO_COUNCIL_REVIEW_TOOL, BLOCK_THERMO_COUNCIL_REVIEW_TOOL],
	});
	return reviewerOutcomeFromRunnerResult(seat, result);
}

export function reviewerOutcomeFromRunnerResult(
	seat: ThermoCouncilSeatConfig,
	result: RunnerSubagentResult<JsonObject>,
): ThermoCouncilReviewerOutcome {
	if (result.status === "completed") {
		if (result.terminal.toolName !== SUBMIT_THERMO_COUNCIL_REVIEW_TOOL) {
			return failedOutcome(
				seat,
				result.sessionFile,
				`Unexpected terminal tool: ${result.terminal.toolName}`,
			);
		}
		const parsed = reviewSchema.safeParse(result.terminal.input);
		if (!parsed.success) {
			return failedOutcome(seat, result.sessionFile, z.prettifyError(parsed.error));
		}
		return {
			type: "completed",
			seat,
			...(result.sessionFile === undefined ? {} : { sessionFile: result.sessionFile }),
			review: normalizeReview(parsed.data),
		};
	}

	if (result.status === "blocked") {
		const parsed = blockedReviewSchema.safeParse(result.terminal.input);
		const reason = parsed.success
			? formatBlockedReason(parsed.data)
			: `Blocked with malformed payload: ${z.prettifyError(parsed.error)}`;
		return {
			type: "blocked",
			seat,
			...(result.sessionFile === undefined ? {} : { sessionFile: result.sessionFile }),
			reason,
		};
	}

	return failedOutcome(seat, result.sessionFile, failureDiagnostic(result));
}

export function renderThermoCouncilReport(
	scope: ThermoCouncilScope,
	outcomes: readonly ThermoCouncilReviewerOutcome[],
): string {
	const completed = outcomes.filter((outcome) => outcome.type === "completed");
	if (completed.length === 0) return renderAllSeatsFailedReport(scope, outcomes);

	const clusters = clusterFindings(completed);
	const mainFindings = clusters.filter((cluster) => cluster.support.length > 1);
	const singleFindings = clusters.filter((cluster) => cluster.support.length === 1);
	return [
		"# Thermo Council Report",
		"",
		"## Scope",
		`- Working directory: ${scope.cwd}`,
		`- Base: ${scope.baseRef} (${scope.baseSha})`,
		`- Head: ${scope.headRef} (${scope.headSha})`,
		`- Changed files: ${scope.changedFiles.length}`,
		`- Diff included in reviewer prompts: ${scope.diffTruncated ? "truncated" : "full"}`,
		"",
		"```text",
		scope.diffStat,
		"```",
		"",
		"## Council Seat Status",
		renderSeatStatusTable(outcomes),
		"",
		"## Synthesis Summary",
		renderSynthesisSummary(completed, clusters),
		"",
		"## Ranked Findings",
		...(mainFindings.length === 0
			? ["No corroborated findings were reported by multiple council seats."]
			: renderFindingClusters(mainFindings)),
		"",
		"## Single-Model / Dissenting Findings",
		...(singleFindings.length === 0
			? ["No single-model findings were reported outside the corroborated set."]
			: renderFindingClusters(singleFindings)),
		"",
		"## Disagreements and Tensions",
		...renderDisagreements(completed),
		"",
		"## Validation Hints",
		...renderValidationHints(clusters),
		"",
		"## Evidence and Safety Notes",
		...outcomes.map(
			(outcome) =>
				`- ${outcome.seat.label} (${outcome.seat.model}): ${outcome.sessionFile ?? "no child session file captured"}`,
		),
		`- ${SAFETY_NOTE}`,
	].join("\n");
}

export function clusterFindings(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
): readonly FindingCluster[] {
	const clusters: FlatFinding[][] = [];
	for (const outcome of completed) {
		for (const finding of outcome.review.findings) {
			const flat = { seat: outcome.seat, finding: withSeatFindingId(outcome.seat, finding) };
			const matchingCluster = clusters.find((cluster) =>
				cluster.some((existing) => shouldClusterFindings(existing.finding, flat.finding)),
			);
			if (matchingCluster) {
				matchingCluster.push(flat);
			} else {
				clusters.push([flat]);
			}
		}
	}
	return clusters.map(toFindingCluster).sort((left, right) => right.rankScore - left.rankScore);
}

async function collectThermoCouncilScope(
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

function parsePositionalModels(value: string | undefined): readonly string[] {
	if (value === undefined || value.trim() === "") return [];
	const entries = value.split(",").map((entry) => entry.trim());
	const emptyIndex = entries.findIndex((entry) => entry.length === 0);
	if (emptyIndex >= 0) {
		throw new Error(`THERMO_COUNCIL_MODELS entry ${emptyIndex + 1} is empty.`);
	}
	return entries;
}

function modelOverride(
	seatSpecific: string | undefined,
	positional: string | undefined,
	defaultModel: string,
	label: string,
): string {
	const candidate = seatSpecific?.trim() || positional?.trim() || defaultModel;
	if (candidate.length === 0) throw new Error(`Empty model override for ${label}.`);
	return candidate;
}

function processEnvReader(): EnvReader {
	return { get: (name) => process.env[name] };
}

function reviewerSeatPrefix(seat: ThermoCouncilSeatConfig): string {
	switch (seat.id) {
		case "anthropic-opus":
			return "opus";
		case "openai-high":
			return "openai";
		case "gemini-high":
			return "gemini";
	}
}

function withSeatFindingId(
	seat: ThermoCouncilSeatConfig,
	finding: ThermoCouncilFinding,
): ThermoCouncilFinding {
	return { ...finding, id: `${reviewerSeatPrefix(seat)}-${finding.id}` };
}

function shouldClusterFindings(left: ThermoCouncilFinding, right: ThermoCouncilFinding): boolean {
	const fileOverlap = left.files.some((file) => right.files.includes(file));
	if (!fileOverlap) return false;
	const titleOverlap = termOverlap(left.title, right.title);
	const problemOverlap = termOverlap(
		`${left.problem} ${left.proposedFix}`,
		`${right.problem} ${right.proposedFix}`,
	);
	return titleOverlap >= 2 || problemOverlap >= 3;
}

function termOverlap(left: string, right: string): number {
	const leftTerms = normalizedTerms(left);
	const rightTerms = normalizedTerms(right);
	return [...leftTerms].filter((term) => rightTerms.has(term)).length;
}

function normalizedTerms(text: string): ReadonlySet<string> {
	const stopWords = new Set([
		"the",
		"and",
		"for",
		"with",
		"that",
		"this",
		"from",
		"into",
		"review",
	]);
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9_/-]+/)
			.map((term) => term.trim())
			.filter((term) => term.length >= 4 && !stopWords.has(term)),
	);
}

function toFindingCluster(findings: readonly FlatFinding[]): FindingCluster {
	const support = uniqueSeats(findings.map((finding) => finding.seat));
	const representative = findings[0]?.finding;
	if (representative === undefined) throw new Error("empty finding cluster");
	const severity = highestSeverity(findings.map((finding) => finding.finding.severity));
	const confidence = highestConfidence(findings.map((finding) => finding.finding.confidence));
	const files = uniqueStrings(findings.flatMap((finding) => finding.finding.files));
	const rankScore =
		support.length * 10_000 + severityScore(severity) * 1_000 + confidenceScore(confidence) * 100;
	return {
		title: representative.title,
		files,
		support,
		findings: [...findings],
		severity,
		confidence,
		rankScore,
	};
}

function uniqueSeats(
	seats: readonly ThermoCouncilSeatConfig[],
): readonly ThermoCouncilSeatConfig[] {
	const byId = new Map<ThermoCouncilSeatId, ThermoCouncilSeatConfig>();
	for (const seat of seats) byId.set(seat.id, seat);
	return [...byId.values()];
}

function uniqueStrings(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort();
}

function highestSeverity(values: readonly FindingSeverity[]): FindingSeverity {
	return [...values].sort((left, right) => severityScore(right) - severityScore(left))[0] ?? "low";
}

function highestConfidence(values: readonly FindingConfidence[]): FindingConfidence {
	return (
		[...values].sort((left, right) => confidenceScore(right) - confidenceScore(left))[0] ??
		"speculative"
	);
}

function severityScore(severity: FindingSeverity): number {
	switch (severity) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "medium":
			return 2;
		case "low":
			return 1;
	}
}

function confidenceScore(confidence: FindingConfidence): number {
	switch (confidence) {
		case "trunk-likely":
			return 4;
		case "likely":
			return 3;
		case "uncertain":
			return 2;
		case "speculative":
			return 1;
	}
}

function renderFindingClusters(clusters: readonly FindingCluster[]): readonly string[] {
	return clusters.flatMap((cluster, index) => {
		const sourceFindings = cluster.findings
			.map((finding) => `${finding.seat.label}:${finding.finding.id}`)
			.join(", ");
		const validationHints = uniqueStrings(
			cluster.findings.flatMap((finding) => finding.finding.validationHints),
		);
		const evidence = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.evidence}`)
			.join("\n");
		const problems = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.problem}`)
			.join("\n");
		const fixes = cluster.findings
			.map((finding) => `- ${finding.seat.label}: ${finding.finding.proposedFix}`)
			.join("\n");
		return [
			`### ${index + 1}. ${cluster.title}`,
			`- Support: ${cluster.support.map((seat) => seat.label).join(", ")}`,
			`- Confidence: ${cluster.confidence}`,
			`- Severity: ${cluster.severity}`,
			`- Files: ${cluster.files.length === 0 ? "(none supplied)" : cluster.files.join(", ")}`,
			`- Source findings: ${sourceFindings}`,
			"- Evidence:",
			evidence,
			"- Problem:",
			problems,
			"- Proposed remediation:",
			fixes,
			`- Behavior risk: ${cluster.findings.map((finding) => `${finding.seat.label}: ${finding.finding.behaviorRisk}`).join(" | ")}`,
			`- Validation hints: ${validationHints.length === 0 ? "None supplied" : validationHints.join("; ")}`,
			"",
		];
	});
}

function renderSeatStatusTable(outcomes: readonly ThermoCouncilReviewerOutcome[]): string {
	return [
		"| Seat | Model | Status | Diagnostic | Child session |",
		"| --- | --- | --- | --- | --- |",
		...outcomes.map((outcome) => {
			const status = outcome.type satisfies ThermoCouncilSeatStatus;
			return `| ${outcome.seat.label} | \`${outcome.seat.model}\` | ${status} | ${seatDiagnostic(outcome)} | ${outcome.sessionFile ?? ""} |`;
		}),
	].join("\n");
}

function seatDiagnostic(outcome: ThermoCouncilReviewerOutcome): string {
	switch (outcome.type) {
		case "completed":
			return `${outcome.review.findings.length} findings`;
		case "blocked":
			return escapeTable(outcome.reason);
		case "failed":
			return escapeTable(outcome.diagnostic);
	}
}

function renderSynthesisSummary(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
	clusters: readonly FindingCluster[],
): string {
	const corroborated = clusters.filter((cluster) => cluster.support.length > 1).length;
	const single = clusters.length - corroborated;
	const summaries = completed.flatMap((outcome) =>
		outcome.review.summary === undefined
			? []
			: [`- ${outcome.seat.label}: ${outcome.review.summary}`],
	);
	return [
		`${completed.length} council seat(s) completed. The deterministic synthesizer found ${clusters.length} finding cluster(s): ${corroborated} corroborated and ${single} single-seat/dissenting.`,
		...(summaries.length === 0 ? [] : ["", ...summaries]),
	].join("\n");
}

function renderDisagreements(
	completed: readonly Extract<ThermoCouncilReviewerOutcome, { readonly type: "completed" }>[],
): readonly string[] {
	const disagreements = completed.flatMap((outcome) =>
		(outcome.review.disagreements ?? []).map((item) => `- ${outcome.seat.label}: ${item}`),
	);
	return disagreements.length === 0 ? ["No explicit disagreements were reported."] : disagreements;
}

function renderValidationHints(clusters: readonly FindingCluster[]): readonly string[] {
	const hints = uniqueStrings(
		clusters.flatMap((cluster) =>
			cluster.findings.flatMap((finding) => finding.finding.validationHints),
		),
	);
	return hints.length === 0
		? ["No validation hints were supplied."]
		: hints.map((hint) => `- ${hint}`);
}

function renderAllSeatsFailedReport(
	scope: ThermoCouncilScope,
	outcomes: readonly ThermoCouncilReviewerOutcome[],
): string {
	return [
		"# Thermo Council Report",
		"",
		"No council seat completed, so /thermo-council did not synthesize review findings.",
		"",
		"## Scope",
		`- Base: ${scope.baseRef} (${scope.baseSha})`,
		`- Head: ${scope.headRef} (${scope.headSha})`,
		"",
		"## Council Seat Status",
		renderSeatStatusTable(outcomes),
		"",
		"## Evidence and Safety Notes",
		`- ${SAFETY_NOTE}`,
	].join("\n");
}

function renderFatalReport(message: string): string {
	return [
		"# Thermo Council Report",
		"",
		"/thermo-council stopped before launching reviewer seats.",
		"",
		"## Reason",
		message,
		"",
		"## Safety Notes",
		SAFETY_NOTE,
	].join("\n");
}

function failedOutcome(
	seat: ThermoCouncilSeatConfig,
	sessionFile: string | undefined,
	diagnostic: string,
): ThermoCouncilReviewerOutcome {
	return {
		type: "failed",
		seat,
		...(sessionFile === undefined ? {} : { sessionFile }),
		diagnostic,
	};
}

function failureDiagnostic(result: RunnerSubagentResult<JsonObject>): string {
	switch (result.status) {
		case "cancelled":
		case "error":
		case "protocol-error":
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			return result.diagnostic;
		case "final-text":
			return "Reviewer returned final text instead of terminal capture.";
		case "completed":
		case "blocked":
			return `Unexpected reviewer result status: ${result.status}.`;
	}
}

function normalizeReview(data: z.infer<typeof reviewSchema>): ThermoCouncilReview {
	return {
		...(data.summary === undefined ? {} : { summary: data.summary }),
		findings: data.findings,
		...(data.disagreements.length === 0 ? {} : { disagreements: data.disagreements }),
	};
}

function formatBlockedReason(data: z.infer<typeof blockedReviewSchema>): string {
	return [
		data.reason,
		...(data.missingContext.length === 0
			? []
			: [`missing context: ${data.missingContext.join(", ")}`]),
		...(data.suggestedRecovery === undefined || data.suggestedRecovery === ""
			? []
			: [`recovery: ${data.suggestedRecovery}`]),
	].join("; ");
}

function emitReport(
	pi: ThermoCouncilExtensionAPI,
	ctx: ThermoCouncilCommandContext,
	reportMarkdown: string,
): void {
	if (pi.sendMessage !== undefined) {
		void pi.sendMessage({
			customType: THERMO_COUNCIL_MESSAGE_TYPE,
			content: reportMarkdown,
			display: true,
			details: { command: THERMO_COUNCIL_COMMAND_NAME },
		});
		return;
	}
	ctx.ui?.notify?.(reportMarkdown, "info");
}

function setStatus(ctx: ThermoCouncilCommandContext, value: string | undefined): void {
	ctx.ui?.setStatus?.(STATUS_KEY, value);
}

function codeFence(value: string): string {
	return ["```text", value, "```"].join("\n");
}

function bounded(value: string): string {
	const limit = 4_000;
	return value.length <= limit ? value : `${value.slice(0, limit)}\n[truncated]`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function escapeTable(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

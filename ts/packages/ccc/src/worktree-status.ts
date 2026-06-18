import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { resolveBrmemCommandCandidates, runBrmemCandidate } from "@asdl/core/brmem-cli";
import { execApiToCommandRunner, formatCommand, normalizeExecResult, tailText, type CommandExecApi, type ExecOptions, type PiExecResultLike } from "@asdl/core/exec";
import { runGitHubCli } from "@asdl/core/github-cli";
import {
	githubPrIdentityFromUrl,
	githubReviewThreadCountsArgs,
	parseGithubPrStatusViewJson,
	parseGithubReviewThreadCountsJson,
	tallyGithubStatusChecks,
	type GithubCheckTally,
	type GithubPrStatusView,
	type GithubReviewThreadCounts,
} from "@asdl/core/github-status";
import { formatErrorMessage } from "@asdl/core/primitives";
import { parseMachineEnvelopeData } from "@asdl/pi-extension-runtime/machine-envelope";
import {
	customMessageText,
	linkifyPrReferences,
	prLinksFromDetails,
	truncateDisplayLine,
	type CustomMessageContent,
} from "@asdl/pi-extension-runtime/terminal-presentation";

import {
	loadGraphiteMetadataStatusInWorker,
	type GraphiteMetadataStatus,
	type GraphiteMetadataWorkerDiagnostic,
	type LoadGraphiteMetadataStatusInWorkerOptions,
} from "./worktree-status/graphite-metadata.ts";

export const WORKTREE_STATUS_UI_KEY = "worktree-status";
const COMMAND_TIMEOUT_MS = 5_000;
const EXCLUDED_BRMEM_NAMESPACES = new Set(["objectives-archive"]);

export type ExecResult = PiExecResultLike;

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

interface BrmemEntry {
	namespace: string;
	key: string;
}

interface GitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

type GitFileParseResult = { type: "found"; paths: GitPaths | undefined } | { type: "not-gitdir-file" };

export type GtCommitStatus =
	| { type: "count"; count: number }
	| { type: "unknown" }
	| { type: "not-applicable" };

export interface GtStatus {
	down: string | undefined;
	up: string;
	commits: GtCommitStatus;
	dirty: "yes" | "no";
}

export interface GraphiteMetadataLoaderOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	onDiagnostic?: ((diagnostic: GraphiteMetadataWorkerDiagnostic) => void) | undefined;
}

export type GraphiteMetadataLoader = (options: GraphiteMetadataLoaderOptions) => Promise<GraphiteMetadataStatus>;

export interface LoadGtStatusOptions {
	pi: ExecGateway;
	cwd: string;
	signal?: AbortSignal | undefined;
	metadataLoader?: GraphiteMetadataLoader | undefined;
	onDiagnostic?: ((diagnostic: GraphiteMetadataWorkerDiagnostic) => void) | undefined;
}

export interface LoadWorktreeStatusOptions {
	signal?: AbortSignal | undefined;
	metadataLoader?: GraphiteMetadataLoader | undefined;
	onDiagnostic?: ((diagnostic: GraphiteMetadataWorkerDiagnostic) => void) | undefined;
}

export interface GhStatus {
	type: "available";
	prNumber: number;
	url?: string | undefined;
	threads: GithubReviewThreadCounts;
	checks: GithubCheckTally;
}

export type WorktreeGhStatus =
	| GhStatus
	| { type: "pending" }
	| { type: "no-pr" }
	| { type: "unavailable"; message?: string | undefined };

export interface LocalWorktreeStatus {
	brmem: string | undefined;
	gt: GtStatus;
	gtMetadataDiagnostic?: GraphiteMetadataWorkerDiagnostic | undefined;
}

export interface WorktreeStatus extends LocalWorktreeStatus {
	gh: WorktreeGhStatus;
}

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	details?: unknown;
}

interface RenderTheme {
	fg(color: string, text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export async function loadWorktreeStatus(
	pi: ExecGateway,
	cwd: string,
	optionsOrSignal?: AbortSignal | LoadWorktreeStatusOptions,
): Promise<WorktreeStatus> {
	const options = normalizeLoadWorktreeStatusOptions(optionsOrSignal);
	const [local, gh] = await Promise.all([
		loadLocalWorktreeStatus(pi, cwd, options),
		loadWorktreeGhStatus(pi, cwd, options.signal),
	]);
	return combineWorktreeStatus(local, gh);
}

export async function loadLocalWorktreeStatus(
	pi: ExecGateway,
	cwd: string,
	optionsOrSignal?: AbortSignal | LoadWorktreeStatusOptions,
): Promise<LocalWorktreeStatus> {
	const options = normalizeLoadWorktreeStatusOptions(optionsOrSignal);
	let gtMetadataDiagnostic: GraphiteMetadataWorkerDiagnostic | undefined;
	const onDiagnostic = (diagnostic: GraphiteMetadataWorkerDiagnostic): void => {
		gtMetadataDiagnostic = diagnostic;
		options.onDiagnostic?.(diagnostic);
	};
	const [brmem, gt] = await Promise.all([
		loadBrmemStatus(pi, cwd, options.signal),
		loadGtStatus({
			pi,
			cwd,
			signal: options.signal,
			metadataLoader: options.metadataLoader,
			onDiagnostic,
		}),
	]);

	const status: LocalWorktreeStatus = { brmem, gt };
	if (gtMetadataDiagnostic !== undefined) status.gtMetadataDiagnostic = gtMetadataDiagnostic;
	return status;
}

export async function loadWorktreeGhStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<WorktreeGhStatus> {
	return loadGhStatus(pi, cwd, signal);
}

export function combineWorktreeStatus(local: LocalWorktreeStatus, gh: WorktreeGhStatus): WorktreeStatus {
	return { ...local, gh };
}

function normalizeLoadWorktreeStatusOptions(
	optionsOrSignal: AbortSignal | LoadWorktreeStatusOptions | undefined,
): LoadWorktreeStatusOptions {
	if (optionsOrSignal === undefined) return {};
	if (isAbortSignal(optionsOrSignal)) return { signal: optionsOrSignal };
	return optionsOrSignal;
}

function isAbortSignal(value: AbortSignal | LoadWorktreeStatusOptions): value is AbortSignal {
	return "aborted" in value && "addEventListener" in value;
}

export async function loadGtStatus(options: LoadGtStatusOptions): Promise<GtStatus> {
	const { pi, cwd, signal } = options;
	const metadataLoader = options.metadataLoader ?? loadCurrentGraphiteMetadataStatusAsync;
	const metadataLoaderOptions: GraphiteMetadataLoaderOptions = {
		cwd,
		signal,
		onDiagnostic: options.onDiagnostic,
	};
	const metadata = await metadataLoader(metadataLoaderOptions);
	const down = loadDownBranch(metadata, signal);
	const up = loadUpBranch(metadata, signal);
	const [commits, dirty] = await Promise.all([
		loadHasCommits(pi, cwd, down, signal),
		loadDirty(pi, cwd, signal),
	]);

	return { down, up, commits, dirty };
}

async function loadBrmemStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string | undefined> {
	for (const candidate of resolveBrmemCommandCandidates(cwd)) {
		if (signal?.aborted) return undefined;

		const run = await runBrmemCandidate({
			gateway: pi,
			cwd,
			candidate,
			brmemArgs: ["list", "--format", "json"],
			timeoutMs: COMMAND_TIMEOUT_MS,
			signal,
		});
		if (run.type === "unavailable") continue;
		if (run.result.killed || run.result.code !== 0) continue;

		const parsed = parseMachineEnvelopeData(run.result.stdout, { label: "brmem list JSON" });
		if (parsed.type !== "valid") continue;

		const status = formatBrmemScopes(parseBrmemEntries(parsed.data.entries));
		return status.length > 0 ? status : undefined;
	}

	return signal?.aborted ? undefined : "unavailable";
}

function parseBrmemEntries(value: unknown): BrmemEntry[] {
	if (!Array.isArray(value)) return [];

	const entries: BrmemEntry[] = [];
	for (const item of value) {
		const entry = brmemEntryFromValue(item);
		if (entry !== undefined) entries.push(entry);
	}
	return entries;
}

function brmemEntryFromValue(value: unknown): BrmemEntry | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.namespace !== "string" || typeof value.key !== "string") return undefined;
	return { namespace: value.namespace, key: value.key };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBrmemScopes(entries: readonly BrmemEntry[]): string {
	const namespaces: Array<{ name: string; keys: string[]; seenKeys: Set<string> }> = [];
	const seenNamespaces = new Map<string, { name: string; keys: string[]; seenKeys: Set<string> }>();

	for (const entry of entries) {
		const scope = displayScopeFromEntry(entry);
		if (!scope) continue;

		let namespace = seenNamespaces.get(scope.namespace);
		if (!namespace) {
			namespace = { name: scope.namespace, keys: [], seenKeys: new Set<string>() };
			seenNamespaces.set(scope.namespace, namespace);
			namespaces.push(namespace);
		}

		if (!namespace.seenKeys.has(scope.key)) {
			namespace.seenKeys.add(scope.key);
			namespace.keys.push(scope.key);
		}
	}

	return namespaces
		.filter((namespace) => namespace.keys.length > 0)
		.map((namespace) => `(${namespace.name}: ${namespace.keys.join(", ")})`)
		.join(" ");
}

function displayScopeFromEntry(entry: BrmemEntry): { namespace: string; key: string } | undefined {
	if (EXCLUDED_BRMEM_NAMESPACES.has(entry.namespace)) return undefined;

	const keyParts = entry.key.split("/").filter((part) => part.length > 0);
	const topLevelKey = keyParts[0] ?? entry.key;
	return topLevelKey.length > 0 ? { namespace: entry.namespace, key: topLevelKey } : undefined;
}

async function loadCurrentGraphiteMetadataStatusAsync(options: GraphiteMetadataLoaderOptions): Promise<GraphiteMetadataStatus> {
	const gitPaths = findGitPaths(options.cwd);
	if (gitPaths === undefined) return { type: "unavailable", reason: "not-a-git-repo" };

	const currentBranch = currentBranchName(gitPaths);
	if (currentBranch === undefined) return { type: "unavailable", reason: "no-current-branch" };

	const workerOptions: LoadGraphiteMetadataStatusInWorkerOptions = {
		signal: options.signal,
		onDiagnostic: options.onDiagnostic,
	};
	return loadGraphiteMetadataStatusInWorker({ commonGitDir: gitPaths.commonGitDir, currentBranch }, workerOptions);
}

function loadDownBranch(metadata: GraphiteMetadataStatus, signal?: AbortSignal): string | undefined {
	if (signal?.aborted) return "-";
	// Metadata is the only passive source used here; falling back to @{-1} produced misleading bases
	// when users had merely checked out an unrelated branch previously.
	if (metadata.type !== "tracked") return "-";
	if (metadata.parent !== undefined) return metadata.parent;
	if (metadata.isCurrentTrunk) return undefined;
	return "-";
}

function loadUpBranch(metadata: GraphiteMetadataStatus, signal?: AbortSignal): string {
	if (signal?.aborted) return "-";
	if (metadata.type !== "tracked") return "-";
	if (metadata.children.length === 0) return "-";
	if (metadata.children.length === 1) return metadata.children[0] ?? "-";
	return "<multiple>";
}

async function loadHasCommits(
	pi: ExecGateway,
	cwd: string,
	down: string | undefined,
	signal?: AbortSignal,
): Promise<GtCommitStatus> {
	if (down === undefined) return { type: "not-applicable" };
	if (down === "-" || signal?.aborted) return { type: "unknown" };

	try {
		const result = normalizeExecResult(
			await pi.exec("git", ["rev-list", "--count", `${down}..HEAD`], execOptions(cwd, signal)),
		);
		if (result.code !== 0) return { type: "unknown" };

		const count = Number.parseInt(result.stdout.trim(), 10);
		if (!Number.isFinite(count) || count < 0) return { type: "unknown" };
		return { type: "count", count };
	} catch {
		return { type: "unknown" };
	}
}

async function loadDirty(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<"yes" | "no"> {
	if (signal?.aborted) return "no";

	try {
		const result = normalizeExecResult(await pi.exec("git", ["status", "--porcelain=v1"], execOptions(cwd, signal)));
		return result.stdout.trim().length > 0 ? "yes" : "no";
	} catch {
		return "no";
	}
}

async function loadGhStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<WorktreeGhStatus> {
	if (signal?.aborted) return { type: "unavailable", message: "request aborted" };

	const ghPrViewArgs = ["pr", "view", "--json", "number,url,statusCheckRollup"];
	const view = await runGitHubCli({
		runner: execApiToCommandRunner(githubCliExecApi(pi)),
		cwd,
		signal,
		timeoutMs: COMMAND_TIMEOUT_MS,
		args: ghPrViewArgs,
	});
	if (view.type === "startup_error") return { type: "unavailable", message: compactErrorMessage(view.message) };
	if (view.result.code !== 0) return ghPrViewNonzeroStatus(view.result);

	const pr = parseGithubPrStatusViewJson(view.result.stdout);
	if (pr === undefined) return { type: "unavailable", message: "could not parse gh pr view output" };

	const reviewThreads = await loadUnresolvedReviewThreadCount({ pi, cwd, pr, signal });
	if (reviewThreads.type === "unavailable") return reviewThreads;
	const checks = tallyGithubStatusChecks(pr.statusCheckRollup);

	return {
		type: "available",
		prNumber: pr.number,
		url: pr.url,
		threads: reviewThreads.counts,
		checks,
	};
}

function ghPrViewNonzeroStatus(result: ExecResult): WorktreeGhStatus {
	const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.toLowerCase();
	if (detail.includes("no pull request found") || detail.includes("no pull requests found")) return { type: "no-pr" };
	return { type: "unavailable", message: compactCommandFailureMessage("gh pr view", result) };
}

type ReviewThreadLoadResult = { type: "available"; counts: GithubReviewThreadCounts } | { type: "unavailable"; message: string };

interface LoadUnresolvedReviewThreadCountOptions {
	readonly pi: ExecGateway;
	readonly cwd: string;
	readonly pr: GithubPrStatusView;
	readonly signal?: AbortSignal | undefined;
}

async function loadUnresolvedReviewThreadCount(options: LoadUnresolvedReviewThreadCountOptions): Promise<ReviewThreadLoadResult> {
	const { pi, cwd, pr, signal } = options;
	const identity = githubPrIdentityFromUrl(pr.url, pr.number);
	if (identity === undefined) return { type: "unavailable", message: "could not identify GitHub repository from PR URL" };

	const args = githubReviewThreadCountsArgs(identity);
	const result = await runGitHubCli({
		runner: execApiToCommandRunner(githubCliExecApi(pi)),
		cwd,
		signal,
		timeoutMs: COMMAND_TIMEOUT_MS,
		args,
	});
	if (result.type === "startup_error") return { type: "unavailable", message: compactErrorMessage(result.message) };
	if (result.result.code !== 0) {
		return { type: "unavailable", message: compactCommandFailureMessage(compactGithubCommandName(args), result.result) };
	}
	const counts = parseGithubReviewThreadCountsJson(result.result.stdout);
	if (counts === undefined) return { type: "unavailable", message: "could not parse gh review thread output" };
	return { type: "available", counts };
}

function currentBranchName(gitPaths: GitPaths): string | undefined {
	try {
		const head = readFileSync(gitPaths.headPath, "utf8").trim();
		const refPrefix = "ref: refs/heads/";
		if (!head.startsWith(refPrefix)) return undefined;

		const branch = head.slice(refPrefix.length).trim();
		return branch.length > 0 ? branch : undefined;
	} catch {
		return undefined;
	}
}

function execOptions(cwd: string, signal?: AbortSignal) {
	return signal === undefined
		? { cwd, timeout: COMMAND_TIMEOUT_MS }
		: { cwd, signal, timeout: COMMAND_TIMEOUT_MS };
}

function githubCliExecApi(pi: ExecGateway): CommandExecApi {
	return {
		async exec(command, args, options) {
			return normalizeExecResult(await pi.exec(command, args, options));
		},
	};
}

function compactGithubCommandName(args: readonly string[]): string {
	return formatCommand("gh", args.slice(0, 2));
}

function compactCommandFailureMessage(command: string, result: ExecResult): string {
	const detail = compactStatusDetail((result.stderr ?? "").trim() || (result.stdout ?? "").trim());
	if (detail.length === 0) return `${command} exited ${result.code}`;
	return `${command} exited ${result.code}: ${detail}`;
}

function compactErrorMessage(error: unknown): string {
	const message = compactStatusDetail(formatErrorMessage(error));
	return message.length > 0 ? message : "unexpected error";
}

function compactStatusDetail(message: string): string {
	return tailText(message.trim().replace(/\s+/g, " "), { maxChars: 160, maxLines: 1 });
}

export function renderWorktreeStatusMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	const prLinks = prLinksFromDetails(message.details);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line) => theme.fg(worktreeStatusLineColor(line), renderWorktreeStatusLine(line, prLinks, width)));
		},
		invalidate(): void {},
	};
}

function renderWorktreeStatusLine(line: string, prLinks: ReadonlyMap<number, string>, width: number): string {
	const truncated = truncateDisplayLine(line, width);
	if (prLinks.size === 0) return truncated;
	return linkifyPrReferences(truncated, prLinks);
}

function worktreeStatusLineColor(line: string): string {
	return line.startsWith("[gt]") ? "accent" : "dim";
}

export interface StatusTheme {
	fg(color: string, value: string): string;
	underline?(value: string): string;
}

export function formatWorktreeStatus(status: WorktreeStatus, theme?: StatusTheme): string[] {
	const lines: string[] = [];
	if (status.brmem !== undefined) {
		lines.push(formatStatusSegment(`[brmem] ${status.brmem}`, theme));
	}
	lines.push(formatGtStatus(status.gt, theme));
	lines.push(...formatWorktreeStatusForFooterTail(status, theme));
	return lines;
}

export function formatWorktreeStatusForFooter(status: WorktreeStatus, theme?: StatusTheme): string[] {
	const lines: string[] = [];
	if (status.brmem !== undefined) {
		lines.push(formatStatusSegment(`[brmem] ${status.brmem}`, theme));
	}
	lines.push(...formatWorktreeStatusForFooterTail(status, theme));
	return lines;
}

function formatWorktreeStatusForFooterTail(status: WorktreeStatus, theme?: StatusTheme): string[] {
	const lines: string[] = [];
	const ghLine = formatGhStatusLine(status.gh, theme);
	if (ghLine !== undefined) lines.push(ghLine);
	if (status.gtMetadataDiagnostic !== undefined) {
		lines.push(formatStatusSegment(formatGraphiteMetadataDiagnostic(status.gtMetadataDiagnostic), theme));
	}
	return lines;
}

function formatGraphiteMetadataDiagnostic(diagnostic: GraphiteMetadataWorkerDiagnostic): string {
	switch (diagnostic.type) {
		case "worker-timeout":
			return `[gt] metadata worker timed out after ${diagnostic.timeoutMs}ms`;
		case "worker-create-failed":
			return "[gt] metadata worker could not start";
		case "worker-error":
			return `[gt] metadata worker error${diagnostic.message === undefined ? "" : `: ${diagnostic.message}`}`;
		case "worker-failure-response":
			return `[gt] metadata worker failed: ${diagnostic.message}`;
		case "worker-malformed-response":
			return "[gt] metadata worker returned a malformed response";
		case "worker-post-message-failed":
			return "[gt] metadata worker could not receive the lookup request";
	}
}

export function formatGtStatus(status: GtStatus, theme?: StatusTheme): string {
	const parts: string[] = [];
	if (status.down !== undefined) parts.push(`↓ ${status.down}`);
	parts.push(`↑ ${status.up}`);
	const commits = formatGtCommitStatus(status.commits);
	if (commits !== undefined) parts.push(commits);
	if (status.dirty === "yes") parts.push("✗");
	return `${formatStatusSegment("[gt]", theme)}${formatStatusSegment(` ${parts.join(" · ")}`, theme)}`;
}

function formatGtCommitStatus(commits: GtCommitStatus): string | undefined {
	switch (commits.type) {
		case "count":
			return `${commits.count} ${commits.count === 1 ? "commit" : "commits"}`;
		case "unknown":
			return "commits ?";
		case "not-applicable":
			return undefined;
	}
}

export function formatGhStatus(status: WorktreeGhStatus, theme?: StatusTheme): string {
	return formatGhStatusLine(status, theme) ?? formatColoredSegment("[gh] checking…", "dim", theme);
}

function formatGhStatusLine(status: WorktreeGhStatus, theme?: StatusTheme): string | undefined {
	if (status.type === "pending") return undefined;
	if (status.type === "no-pr") return formatColoredSegment("[gh] no PR", "dim", theme);
	if (status.type === "unavailable") {
		const detail = status.message === undefined ? "" : formatColoredSegment(`: ${status.message}`, "dim", theme);
		return `${formatColoredSegment("[gh] unavailable", "warning", theme)}${detail}`;
	}

	const resolvedThreads = Math.max(0, status.threads.total - status.threads.unresolved);
	const commentsValue = `${resolvedThreads}/${status.threads.total}${status.threads.hasMore ? "+" : ""}`;
	const pieces = [
		formatColoredSegment("[gh]", "dim", theme),
		formatColoredSegment(" ", "dim", theme),
		formatColoredSegment(`#${status.prNumber}`, "accent", theme),
		formatColoredSegment(" · comments ", "dim", theme),
		formatColoredSegment(commentsValue, status.threads.unresolved > 0 ? "warning" : "dim", theme),
		formatColoredSegment(" · actions ", "dim", theme),
		...formatActionBucketSegments(status.checks, theme),
	];
	if (isGhStatusLandable(status)) {
		pieces.push(formatColoredSegment(" · ", "dim", theme), formatColoredSegment("landable", "accent", theme));
	}
	return pieces.join("");
}

function isGhStatusLandable(status: GhStatus): boolean {
	return status.threads.unresolved === 0 && hasNoBlockingChecks(status.checks);
}

function hasNoBlockingChecks(checks: GithubCheckTally): boolean {
	// Zero configured checks are treated as no blocking checks.
	return checks.pending === 0 && checks.failing === 0 && checks.unknown === 0;
}

function formatActionBucketSegments(checks: GithubCheckTally, theme?: StatusTheme): string[] {
	if (checks.pending === 0 && checks.failing === 0 && checks.unknown === 0) {
		return [formatColoredSegment(`${checks.passing}✓`, "accent", theme)];
	}
	const buckets: string[] = [];
	if (checks.pending > 0) buckets.push(formatColoredSegment(`${checks.pending}⏳`, "warning", theme));
	if (checks.failing > 0) buckets.push(formatColoredSegment(`${checks.failing}✗`, "error", theme));
	if (checks.unknown > 0) buckets.push(formatColoredSegment(`${checks.unknown}?`, "warning", theme));
	return intersperseActionBucketSpaces(buckets, theme);
}

function intersperseActionBucketSpaces(buckets: readonly string[], theme?: StatusTheme): string[] {
	const segments: string[] = [];
	for (const [index, bucket] of buckets.entries()) {
		if (index > 0) segments.push(formatColoredSegment(" ", "dim", theme));
		segments.push(bucket);
	}
	return segments;
}

function formatStatusSegment(text: string, theme: StatusTheme | undefined): string {
	return formatColoredSegment(text, "dim", theme);
}

function formatColoredSegment(text: string, color: string, theme: StatusTheme | undefined): string {
	return theme ? theme.fg(color, text) : text;
}

function findGitPaths(cwd: string): GitPaths | undefined {
	let dir = resolve(cwd);
	for (;;) {
		const gitPath = join(dir, ".git");
		if (existsSync(gitPath)) {
			try {
				const stat = statSync(gitPath);
				if (stat.isFile()) {
					const gitFileResult = gitPathsFromGitFile(dir, gitPath);
					if (gitFileResult.type === "found") return gitFileResult.paths;
				} else if (stat.isDirectory()) {
					const headPath = join(gitPath, "HEAD");
					if (!existsSync(headPath)) return undefined;
					return { repoDir: dir, gitDir: gitPath, commonGitDir: gitPath, headPath };
				}
			} catch {
				return undefined;
			}
		}

		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function gitPathsFromGitFile(repoDir: string, gitPath: string): GitFileParseResult {
	const content = readFileSync(gitPath, "utf8").trim();
	if (!content.startsWith("gitdir: ")) return { type: "not-gitdir-file" };

	const gitDir = resolve(repoDir, content.slice(8).trim());
	const headPath = join(gitDir, "HEAD");
	if (!existsSync(headPath)) return { type: "found", paths: undefined };

	const commonDirPath = join(gitDir, "commondir");
	const commonGitDir = existsSync(commonDirPath) ? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim()) : gitDir;
	return { type: "found", paths: { repoDir, gitDir, commonGitDir, headPath } };
}

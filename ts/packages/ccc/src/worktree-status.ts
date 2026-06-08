import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { resolveBrmemCommandCandidates, runBrmemCandidate } from "@asdl/pi-extension-runtime/brmem-cli";
import type { PiExecResultLike } from "@asdl/pi-extension-runtime/command-runtime";
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
const EMPTY_BRANCH_ICON = "∅";
const COMMAND_TIMEOUT_MS = 5_000;
const EXCLUDED_BRMEM_NAMESPACES = new Set(["objectives-archive"]);

export type ExecResult = PiExecResultLike;

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

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

export interface GtStatus {
	down: string | undefined;
	up: string;
	commits: "yes" | "no" | "?" | "n/a";
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

export interface WorktreeStatus {
	brmem: string | undefined;
	gt: GtStatus;
	gtMetadataDiagnostic?: GraphiteMetadataWorkerDiagnostic | undefined;
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

	const status: WorktreeStatus = { brmem, gt };
	if (gtMetadataDiagnostic !== undefined) status.gtMetadataDiagnostic = gtMetadataDiagnostic;
	return status;
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
		if (parsed.type === "invalid") continue;

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
): Promise<"yes" | "no" | "?" | "n/a"> {
	if (down === undefined) return "n/a";
	if (down === "-" || signal?.aborted) return "?";

	try {
		const result = await pi.exec("git", ["rev-list", "--count", `${down}..HEAD`], execOptions(cwd, signal));
		if (result.code !== 0) return "?";

		const count = Number.parseInt(result.stdout.trim(), 10);
		if (!Number.isFinite(count)) return "?";
		return count > 0 ? "yes" : "no";
	} catch {
		return "?";
	}
}

async function loadDirty(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<"yes" | "no"> {
	if (signal?.aborted) return "no";

	try {
		const result = await pi.exec("git", ["status", "--porcelain=v1"], execOptions(cwd, signal));
		return result.stdout.trim().length > 0 ? "yes" : "no";
	} catch {
		return "no";
	}
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
	const down = status.down === undefined ? "" : ` (↓: ${status.down})`;
	const commits =
		status.commits === "n/a"
			? ""
			: status.commits === "yes"
				? " (commits)"
				: status.commits === "?"
					? " (commits: ?)"
					: ` ${EMPTY_BRANCH_ICON}`;
	const dirty = status.dirty === "yes" ? " (x)" : "";
	const rest = `${down} (↑: ${status.up})${commits}${dirty}`;
	return `${formatStatusSegment("[gt]", theme)}${formatStatusSegment(rest, theme)}`;
}

function formatStatusSegment(text: string, theme: StatusTheme | undefined): string {
	return theme ? theme.fg("dim", text) : text;
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

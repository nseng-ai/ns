import type { Dirent } from "node:fs";
import { mkdir, open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { formatCommand, type ExecResult } from "../command-runtime.ts";
import { formatCommandFailure, normalizeSummary, validatePlanSlug, type PlanCommandExecApi, type ExecOptions } from "./plan-persistence.ts";

const GIT_TIMEOUT_MS = 10_000;
const MAX_SEGMENT_LENGTH = 120;

export type RepoIdentitySource = "origin-url" | "repo-root";

export interface SourceBranchPlanFileParams {
	slug: string;
	content: string;
	summary?: string;
}

export interface SourceBranchPlanFileOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	planStoreRoot?: string | undefined;
}

export interface PlanStoreDirectoryEvidence {
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	directoryPath: string;
}

export interface LatestSourceBranchPlanFileEvidence extends PlanStoreDirectoryEvidence {
	slug: string;
	filePath: string;
	fileName: string;
	modifiedTimeMs: number;
}

export interface SourceBranchPlanFileEvidence {
	slug: string;
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	filePath: string;
	summary?: string;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

interface RepoIdentity {
	source: RepoIdentitySource;
	identity: string;
}

export function defaultPlanStoreRoot(): string {
	return join(homedir(), ".asdl", "plans");
}

export function normalizeRepoOriginUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (trimmed.length === 0) {
		return "";
	}

	const scpLike = parseScpLikeRemote(trimmed);
	const candidate = scpLike ?? trimmed;
	const normalizedUrl = normalizeAsUrl(candidate);
	if (normalizedUrl !== undefined) {
		return normalizedUrl;
	}

	return stripGitSuffix(stripTrailingSlashes(candidate));
}

export function buildRepoPlanStoreKey(repoRoot: string, normalizedIdentity: string): string {
	const identity = normalizeRepoOriginUrl(normalizedIdentity);
	const githubIdentity = parseGitHubRepoIdentity(identity);
	if (githubIdentity !== undefined) {
		const owner = sanitizePlanPathSegment(githubIdentity.owner.toLowerCase(), "owner");
		const repo = sanitizePlanPathSegment(githubIdentity.repo.toLowerCase(), "repo");
		return `gh--${owner}--${repo}`;
	}

	return sanitizePlanPathSegment(identity, basename(resolve(repoRoot)) || "repo");
}

export function encodeBranchForPlanPath(branch: string): string {
	return branch
		.split("/")
		.map((segment, index) => sanitizePlanPathSegment(segment, `branch-${index + 1}`))
		.join("---");
}

export function sanitizePlanPathSegment(value: string, fallback: string): string {
	const safeFallback =
		fallback
			.replace(/[^A-Za-z0-9._-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^[.-]+/, "")
			.replace(/[.-]+$/, "") || "segment";
	let sanitized = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+/, "")
		.replace(/[.-]+$/, "")
		.slice(0, MAX_SEGMENT_LENGTH)
		.replace(/^[.-]+/, "")
		.replace(/[.-]+$/, "");

	if (sanitized.length === 0 || sanitized === "." || sanitized === "..") {
		sanitized = safeFallback;
	}

	return sanitized;
}

export function formatSourceBranchPlanFileEvidence(evidence: SourceBranchPlanFileEvidence): string {
	const lines = [
		"Saved plan file in local plan store.",
		`Path: ${evidence.filePath}`,
		`Repo key: ${evidence.repoKey}`,
		`Repo root: ${evidence.repoRoot}`,
		`Repo identity source: ${evidence.repoIdentitySource}`,
		`Source branch: ${evidence.sourceBranch}`,
		`Branch path segment: ${evidence.branchKey}`,
		`Slug: ${evidence.slug}`,
	];
	if (evidence.summary !== undefined) {
		lines.push(`Summary: ${evidence.summary}`);
	}
	return lines.join("\n");
}

export async function resolvePlanStoreDirectory(
	pi: PlanCommandExecApi,
	options: SourceBranchPlanFileOptions,
): Promise<PlanStoreDirectoryEvidence> {
	const repoRoot = await resolveRequiredGitRepoRoot(pi, options.cwd, options.signal);
	const sourceBranch = await resolveCurrentBranch(pi, options.cwd, options.signal);
	const repoIdentity = await resolveRepoIdentity(pi, options.cwd, repoRoot, options.signal);
	const repoKey = buildRepoPlanStoreKey(repoRoot, repoIdentity.identity);
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	const planStoreRoot = options.planStoreRoot ?? defaultPlanStoreRoot();
	const directoryPath = join(planStoreRoot, repoKey, branchKey);

	return {
		repoRoot,
		repoKey,
		repoIdentitySource: repoIdentity.source,
		sourceBranch,
		branchKey,
		directoryPath,
	};
}

export async function findLatestSourceBranchPlanFile(
	pi: PlanCommandExecApi,
	options: SourceBranchPlanFileOptions,
): Promise<LatestSourceBranchPlanFileEvidence> {
	const directory = await resolvePlanStoreDirectory(pi, options);
	const entries = await readPlanStoreDirectory(directory);
	const candidates: Array<{ fileName: string; filePath: string; modifiedTimeMs: number }> = [];

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) {
			continue;
		}

		const filePath = join(directory.directoryPath, entry.name);
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			continue;
		}
		candidates.push({ fileName: entry.name, filePath, modifiedTimeMs: fileStat.mtimeMs });
	}

	if (candidates.length === 0) {
		throw new Error(
			[
				"No Markdown saved plan files exist in the local plan store for the current repository and branch.",
				`Plan store directory: ${directory.directoryPath}`,
				"Run /write-plan first, or pass an explicit absolute or home-relative plan file path.",
			].join("\n"),
		);
	}

	const latest = candidates.sort(compareLatestSourcePlanCandidates)[0];
	if (latest === undefined) {
		throw new Error(`No Markdown saved plan files exist in the local plan store directory ${directory.directoryPath}.`);
	}

	return {
		...directory,
		slug: latest.fileName.slice(0, -".md".length),
		filePath: latest.filePath,
		fileName: latest.fileName,
		modifiedTimeMs: latest.modifiedTimeMs,
	};
}

export async function writeSourceBranchPlanFile(
	pi: PlanCommandExecApi,
	rawParams: unknown,
	options: SourceBranchPlanFileOptions,
): Promise<SourceBranchPlanFileEvidence> {
	const params = parseSourceBranchPlanFileParams(rawParams);
	const slug = params.slug.trim();
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid saved plan slug: ${slugError}`);
	}

	const directory = await resolvePlanStoreDirectory(pi, options);
	const filePath = join(directory.directoryPath, `${slug}.md`);

	await writeExclusiveFile(filePath, params.content);

	const evidence = {
		slug,
		repoRoot: directory.repoRoot,
		repoKey: directory.repoKey,
		repoIdentitySource: directory.repoIdentitySource,
		sourceBranch: directory.sourceBranch,
		branchKey: directory.branchKey,
		filePath,
	};
	const summary = normalizeSummary(params.summary);
	if (summary === undefined) {
		return evidence;
	}
	return { ...evidence, summary };
}

function parseSourceBranchPlanFileParams(params: unknown): SourceBranchPlanFileParams {
	if (!isRecord(params)) {
		throw new Error("writeSourceBranchPlanFile parameters must be an object.");
	}

	const slug = params.slug;
	const content = params.content;
	const summary = params.summary;
	if (typeof slug !== "string") {
		throw new Error("writeSourceBranchPlanFile requires string parameter `slug`.");
	}
	if (typeof content !== "string") {
		throw new Error("writeSourceBranchPlanFile requires string parameter `content`.");
	}
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error("writeSourceBranchPlanFile parameter `summary` must be a string when provided.");
	}

	if (summary === undefined) {
		return { slug, content };
	}
	return { slug, content, summary };
}

async function resolveRequiredGitRepoRoot(
	pi: PlanCommandExecApi,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const root = await runGit(pi, cwd, ["rev-parse", "--show-toplevel"], signal);
	if (root.result.code !== 0 || root.result.killed) {
		throw new Error(formatCommandFailure("git rev-parse --show-toplevel failed", root.displayCommand, root.result));
	}

	const repoRoot = firstNonEmptyLine(root.result.stdout);
	if (repoRoot === undefined) {
		throw new Error(`git rev-parse --show-toplevel returned no repo root.\nCommand: ${root.displayCommand}`);
	}
	return realpathIfPossible(repoRoot);
}

async function resolveCurrentBranch(pi: PlanCommandExecApi, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await runGit(pi, cwd, ["branch", "--show-current"], signal);
	if (branch.result.code !== 0 || branch.result.killed) {
		throw new Error(formatCommandFailure("git branch --show-current failed", branch.displayCommand, branch.result));
	}

	const currentBranch = firstNonEmptyLine(branch.result.stdout);
	if (currentBranch === undefined) {
		throw new Error("Current git checkout is detached or unnamed; check out a named branch before creating a source-branch plan file.");
	}
	return currentBranch;
}

async function resolveRepoIdentity(
	pi: PlanCommandExecApi,
	cwd: string,
	repoRoot: string,
	signal: AbortSignal | undefined,
): Promise<RepoIdentity> {
	const origin = await runGit(pi, cwd, ["config", "--get", "remote.origin.url"], signal);
	if (origin.result.killed) {
		throw new Error(formatCommandFailure("git config --get remote.origin.url was killed", origin.displayCommand, origin.result));
	}

	if (origin.result.code === 0) {
		const normalized = normalizeRepoOriginUrl(origin.result.stdout);
		if (normalized.length > 0) {
			return { source: "origin-url", identity: normalized };
		}
		return { source: "repo-root", identity: await realpathIfPossible(repoRoot) };
	}

	if (origin.result.code === 1) {
		return { source: "repo-root", identity: await realpathIfPossible(repoRoot) };
	}

	throw new Error(formatCommandFailure("git config --get remote.origin.url failed", origin.displayCommand, origin.result));
}

async function readPlanStoreDirectory(directory: PlanStoreDirectoryEvidence): Promise<Dirent[]> {
	try {
		return await readdir(directory.directoryPath, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new Error(
				[
					"No local plan store directory exists for the current repository and branch.",
					`Plan store directory: ${directory.directoryPath}`,
					`Repo key: ${directory.repoKey}`,
					`Source branch: ${directory.sourceBranch}`,
					`Branch path segment: ${directory.branchKey}`,
					"Run /write-plan first, or pass an explicit absolute or home-relative plan file path.",
				].join("\n"),
			);
		}
		throw error;
	}
}

function compareLatestSourcePlanCandidates(
	left: { fileName: string; filePath: string; modifiedTimeMs: number },
	right: { fileName: string; filePath: string; modifiedTimeMs: number },
): number {
	if (left.modifiedTimeMs !== right.modifiedTimeMs) {
		return right.modifiedTimeMs - left.modifiedTimeMs;
	}
	return right.filePath.localeCompare(left.filePath);
}

async function writeExclusiveFile(filePath: string, content: string): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });

	let file: Awaited<ReturnType<typeof open>> | undefined;
	try {
		file = await open(filePath, "wx");
		await file.writeFile(content, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "EEXIST") {
			throw new Error(`Saved plan file already exists in the local plan store; refusing to overwrite.\nPath: ${filePath}`);
		}
		throw error;
	} finally {
		await file?.close();
	}
}

async function runGit(
	pi: PlanCommandExecApi,
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
): Promise<CommandRun> {
	const displayCommand = formatCommand("git", args);
	try {
		const result = await pi.exec("git", args, execOptions(cwd, GIT_TIMEOUT_MS, signal));
		return { result, displayCommand };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`git command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`);
	}
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function normalizeAsUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}

	const protocol = url.protocol.toLowerCase();
	const host = url.hostname.toLowerCase();
	const username = url.username ? `${url.username}@` : "";
	const port = url.port ? `:${url.port}` : "";
	const path = stripGitSuffix(stripTrailingSlashes(url.pathname.replace(/^\/+/, "")));
	if (path.length === 0) {
		return `${protocol}//${username}${host}${port}`;
	}
	return `${protocol}//${username}${host}${port}/${path}`;
}

interface GitHubRepoIdentity {
	owner: string;
	repo: string;
}

function parseGitHubRepoIdentity(normalizedIdentity: string): GitHubRepoIdentity | undefined {
	let url: URL;
	try {
		url = new URL(normalizedIdentity);
	} catch {
		return undefined;
	}

	if (url.hostname.toLowerCase() !== "github.com") {
		return undefined;
	}

	const pathSegments = stripGitSuffix(stripTrailingSlashes(url.pathname))
		.replace(/^\/+/, "")
		.split("/")
		.filter((segment) => segment.length > 0);
	const [owner, repo] = pathSegments;
	if (owner === undefined || repo === undefined) {
		return undefined;
	}

	return { owner, repo };
}

function parseScpLikeRemote(value: string): string | undefined {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
		return undefined;
	}

	const match = /^(?<user>[^@/:]+@)?(?<host>[^:/]+):(?<path>.+)$/.exec(value);
	if (!match?.groups) {
		return undefined;
	}

	const user = match.groups.user ?? "";
	return `ssh://${user}${match.groups.host}/${match.groups.path}`;
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/g, "");
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, "");
}

async function realpathIfPossible(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

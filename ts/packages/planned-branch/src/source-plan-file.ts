import type { Dirent } from "node:fs";
import { mkdir, open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import { normalizeSummary, validatePlanSlug, type PlanCommandExecApi } from "./plan-persistence.ts";
import { isRecord } from "./primitives.ts";

const MAX_SEGMENT_LENGTH = 120;
const PLAN_FILE_SUFFIX = ".md";
const PLAN_FILE_DISPLAY_NAME = "Markdown saved plan";
const WRITE_PLAN_COMMAND = "/planned-branch:write-plan";

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
	git?: PlannedBranchGitGateway | undefined;
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

interface RepoIdentity {
	source: RepoIdentitySource;
	identity: string;
}

export function defaultPlanStoreRoot(): string {
	return join(homedir(), ".asdl", "planned-branch", "plans");
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

export function buildPlanFileName(slug: string): string {
	return `${slug}${PLAN_FILE_SUFFIX}`;
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
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const repoRoot = await resolveRequiredGitRepoRoot(git, options.cwd, options.signal);
	const sourceBranch = await resolveCurrentBranch(git, options.cwd, options.signal);
	const repoIdentity = await resolveRepoIdentity(git, { cwd: options.cwd, repoRoot, signal: options.signal });
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
		if (!entry.isFile() || !entry.name.endsWith(PLAN_FILE_SUFFIX)) {
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
				`No ${PLAN_FILE_DISPLAY_NAME} files exist in the local plan store for the current repository and branch.`,
				`Plan store directory: ${directory.directoryPath}`,
				`Run ${WRITE_PLAN_COMMAND} first, or pass an explicit absolute or home-relative plan file path.`,
			].join("\n"),
		);
	}

	const latest = candidates.sort(compareLatestSourcePlanCandidates)[0];
	if (latest === undefined) {
		throw new Error(`No ${PLAN_FILE_DISPLAY_NAME} files exist in the local plan store directory ${directory.directoryPath}.`);
	}

	return {
		...directory,
		slug: latest.fileName.slice(0, -PLAN_FILE_SUFFIX.length),
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
	const filePath = join(directory.directoryPath, buildPlanFileName(slug));

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

async function resolveRequiredGitRepoRoot(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const root = await git.repoRoot({ cwd, signal });
	if (!root.ok) {
		throw new Error(root.error.message);
	}
	return realpathIfPossible(root.value);
}

async function resolveCurrentBranch(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await git.sourceBranch({ cwd, signal });
	if (!branch.ok) {
		if (branch.error.code === "detached_head") {
			throw new Error("Current git checkout is detached or unnamed; check out a named branch before creating a source-branch plan file.");
		}
		throw new Error(branch.error.message);
	}
	return branch.value;
}

interface RepoIdentityOptions {
	cwd: string;
	repoRoot: string;
	signal?: AbortSignal | undefined;
}

async function resolveRepoIdentity(git: PlannedBranchGitGateway, options: RepoIdentityOptions): Promise<RepoIdentity> {
	const origin = await git.originUrl({ cwd: options.cwd, signal: options.signal });
	if (origin.type === "error") {
		throw new Error(origin.error.message);
	}

	if (origin.type === "found") {
		const normalized = normalizeRepoOriginUrl(origin.value);
		if (normalized.length > 0) {
			return { source: "origin-url", identity: normalized };
		}
	}

	return { source: "repo-root", identity: await realpathIfPossible(options.repoRoot) };
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
					`Run ${WRITE_PLAN_COMMAND} first, or pass an explicit absolute or home-relative plan file path.`,
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

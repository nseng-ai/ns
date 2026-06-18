import type { Dirent } from "node:fs";
import { mkdir, open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import type { CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { githubRepositoryIdentityFromNormalizedRemoteUrl, normalizeGitRemoteUrl } from "@asdl/core/github-status";
import { normalizeSummary, validatePlanSlug } from "./plan-persistence.ts";
import { isRecord } from "@asdl/core/primitives";

const MAX_SEGMENT_LENGTH = 120;
const PLAN_FILE_SUFFIX = ".md";
const PLAN_FILE_DISPLAY_NAME = "Markdown saved plan";

export type RepoIdentitySource = "origin-url" | "repo-root";

export interface SavedPlanFileParams {
	slug: string;
	content: string;
	summary?: string;
}

export interface PlanStoreOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	planStoreRoot?: string | undefined;
	git?: GitGateway | undefined;
}

export interface PlanStoreRepoEvidence {
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	repoDirectoryPath: string;
}

export interface PlanStoreDirectoryEvidence {
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	directoryPath: string;
}

export interface SavedPlanListItem extends PlanStoreRepoEvidence {
	slug: string;
	branchKey: string;
	filePath: string;
	fileName: string;
	modifiedTimeMs: number;
}

export interface LatestSavedPlanFileEvidence extends PlanStoreDirectoryEvidence {
	slug: string;
	filePath: string;
	fileName: string;
	modifiedTimeMs: number;
}

export interface SavedPlanFileEvidence {
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

export type NoSavedPlanAvailableReason = "missing-directory" | "no-plan-files";

export class NoSavedPlanAvailableError extends Error {
	readonly reason: NoSavedPlanAvailableReason;
	readonly directoryPath: string;

	constructor(params: { reason: NoSavedPlanAvailableReason; directoryPath: string; message: string }) {
		super(params.message);
		this.name = "NoSavedPlanAvailableError";
		this.reason = params.reason;
		this.directoryPath = params.directoryPath;
	}
}

export function defaultPlanStoreRoot(): string {
	return join(homedir(), ".asdl", "enriched-plan");
}

export function normalizeRepoOriginUrl(rawUrl: string): string {
	return normalizeGitRemoteUrl(rawUrl);
}

export function buildRepoPlanStoreKey(repoRoot: string, normalizedIdentity: string): string {
	const identity = normalizeRepoOriginUrl(normalizedIdentity);
	const githubIdentity = githubRepositoryIdentityFromNormalizedRemoteUrl(identity);
	if (githubIdentity !== undefined) {
		const owner = sanitizePlanPathSegment(githubIdentity.owner.toLowerCase(), "owner");
		const repo = sanitizePlanPathSegment(githubIdentity.repo.toLowerCase(), "repo");
		return `gh--${owner}--${repo}`;
	}

	const repoRootName = basename(resolve(repoRoot));
	return sanitizePlanPathSegment(identity, repoRootName.length > 0 ? repoRootName : "repo");
}

export function encodeBranchForPlanPath(branch: string): string {
	return branch
		.split("/")
		.map((segment, index) => sanitizePlanPathSegment(segment, `branch-${index + 1}`))
		.join("---");
}

export function sanitizePlanPathSegment(value: string, fallback: string): string {
	const sanitizedFallback = fallback
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+/, "")
		.replace(/[.-]+$/, "");
	const safeFallback = sanitizedFallback.length > 0 ? sanitizedFallback : "segment";
	let sanitized = value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
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

export function formatSavedPlanFileEvidence(evidence: SavedPlanFileEvidence): string {
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

export async function resolvePlanStoreRepoDirectory(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<PlanStoreRepoEvidence> {
	const git = options.git ?? new RealGitGateway(pi);
	const repoRoot = await resolveRequiredGitRepoRoot(git, options.cwd, options.signal);
	const repoIdentity = await resolveRepoIdentity(git, { cwd: options.cwd, repoRoot, signal: options.signal });
	const repoKey = buildRepoPlanStoreKey(repoRoot, repoIdentity.identity);
	const planStoreRoot = options.planStoreRoot ?? defaultPlanStoreRoot();

	return {
		repoRoot,
		repoKey,
		repoIdentitySource: repoIdentity.source,
		repoDirectoryPath: join(planStoreRoot, repoKey),
	};
}

export async function resolvePlanStoreDirectory(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<PlanStoreDirectoryEvidence> {
	const git = options.git ?? new RealGitGateway(pi);
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

export async function listSavedPlans(pi: CommandExecApi, options: PlanStoreOptions): Promise<SavedPlanListItem[]> {
	const repoDirectory = await resolvePlanStoreRepoDirectory(pi, options);
	const branchEntries = await readDirectoryIfExists(repoDirectory.repoDirectoryPath);
	const plans: SavedPlanListItem[] = [];

	for (const branchEntry of branchEntries) {
		if (!branchEntry.isDirectory()) {
			continue;
		}

		const branchKey = branchEntry.name;
		const branchDirectoryPath = join(repoDirectory.repoDirectoryPath, branchKey);
		const planEntries = await readDirectoryIfExists(branchDirectoryPath);
		for (const planEntry of planEntries) {
			if (!planEntry.isFile() || !planEntry.name.endsWith(PLAN_FILE_SUFFIX)) {
				continue;
			}

			const filePath = join(branchDirectoryPath, planEntry.name);
			const fileStat = await statFileIfRegular(filePath);
			if (fileStat === undefined) {
				continue;
			}

			plans.push({
				...repoDirectory,
				branchKey,
				slug: planEntry.name.slice(0, -PLAN_FILE_SUFFIX.length),
				filePath,
				fileName: planEntry.name,
				modifiedTimeMs: fileStat.mtimeMs,
			});
		}
	}

	return plans.sort(compareSavedPlanListItems);
}

export async function findLatestSavedPlanFile(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<LatestSavedPlanFileEvidence> {
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
		throw new NoSavedPlanAvailableError({
			reason: "no-plan-files",
			directoryPath: directory.directoryPath,
			message: [
				`No ${PLAN_FILE_DISPLAY_NAME} files exist in the local plan store for the current repository and branch.`,
				`Plan store directory: ${directory.directoryPath}`,
				"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
			].join("\n"),
		});
	}

	const latest = candidates.sort(compareLatestSavedPlanCandidates)[0];
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

export async function writeSavedPlanFile(
	pi: CommandExecApi,
	rawParams: unknown,
	options: PlanStoreOptions,
): Promise<SavedPlanFileEvidence> {
	const params = parseSavedPlanFileParams(rawParams);
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

function parseSavedPlanFileParams(params: unknown): SavedPlanFileParams {
	if (!isRecord(params)) {
		throw new Error("writeSavedPlanFile parameters must be an object.");
	}

	const slug = params.slug;
	const content = params.content;
	const summary = params.summary;
	if (typeof slug !== "string") {
		throw new Error("writeSavedPlanFile requires string parameter `slug`.");
	}
	if (typeof content !== "string") {
		throw new Error("writeSavedPlanFile requires string parameter `content`.");
	}
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error("writeSavedPlanFile parameter `summary` must be a string when provided.");
	}

	if (summary === undefined) {
		return { slug, content };
	}
	return { slug, content, summary };
}

async function resolveRequiredGitRepoRoot(git: GitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const root = await git.repoRoot({ cwd, signal });
	if (!root.ok) {
		throw new Error(root.error.message);
	}
	return realpathIfPossible(root.value);
}

async function resolveCurrentBranch(git: GitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const branch = await git.currentBranch({ cwd, signal });
	if (!branch.ok) {
		if (branch.error.code === "detached_head") {
			throw new Error("Current git checkout is detached or unnamed; check out a named branch before creating a saved plan file.");
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

async function resolveRepoIdentity(git: GitGateway, options: RepoIdentityOptions): Promise<RepoIdentity> {
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
			throw new NoSavedPlanAvailableError({
				reason: "missing-directory",
				directoryPath: directory.directoryPath,
				message: [
					"No local plan store directory exists for the current repository and branch.",
					`Plan store directory: ${directory.directoryPath}`,
					`Repo key: ${directory.repoKey}`,
					`Source branch: ${directory.sourceBranch}`,
					`Branch path segment: ${directory.branchKey}`,
					"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
				].join("\n"),
			});
		}
		throw error;
	}
}

async function readDirectoryIfExists(path: string): Promise<Dirent[]> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function statFileIfRegular(path: string): Promise<{ mtimeMs: number } | undefined> {
	try {
		const fileStat = await stat(path);
		return fileStat.isFile() ? { mtimeMs: fileStat.mtimeMs } : undefined;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function compareSavedPlanListItems(left: SavedPlanListItem, right: SavedPlanListItem): number {
	if (left.modifiedTimeMs !== right.modifiedTimeMs) {
		return right.modifiedTimeMs - left.modifiedTimeMs;
	}
	const branchCompare = left.branchKey.localeCompare(right.branchKey);
	if (branchCompare !== 0) {
		return branchCompare;
	}
	return left.fileName.localeCompare(right.fileName);
}

function compareLatestSavedPlanCandidates(
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

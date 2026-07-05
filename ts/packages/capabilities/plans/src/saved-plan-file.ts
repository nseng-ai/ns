import process from "node:process";
import { basename, join, resolve } from "node:path";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import {
	githubRepositoryIdentityFromNormalizedRemoteUrl,
	normalizeGitRemoteUrl,
} from "@nseng-ai/capability-kit/github/identity";
import { normalizeSummary, validatePlanSlug } from "./plan-persistence.ts";
import { createRealPlanStoreGateway, type PlanStoreGateway } from "./plan-store-gateway.ts";
import { requireXdgPath, resolveNsXdgPath } from "@nseng-ai/capability-kit/xdg";
import {
	isRecord,
	optionalEntries,
	optionalEntry,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";

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
	signal?: AbortSignal;
	planStoreRoot?: string;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	git?: GitGateway;
	planStoreGateway?: PlanStoreGateway;
}

interface BuildPlanStoreOptionsInput {
	cwd: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	planStoreRoot?: ExplicitUndefined<"di-seam", string>;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	git?: ExplicitUndefined<"di-seam", GitGateway>;
	planStoreGateway?: ExplicitUndefined<"di-seam", PlanStoreGateway>;
}

export function buildPlanStoreOptions(options: BuildPlanStoreOptionsInput): PlanStoreOptions {
	return {
		cwd: options.cwd,
		...optionalEntries({
			signal: options.signal,
			planStoreRoot: options.planStoreRoot,
			env: options.env,
			git: options.git,
			planStoreGateway: options.planStoreGateway,
		}),
	};
}

export interface PlanStoreRepoEvidence {
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	repoDirectoryPath: string;
}

export interface PlanStoreDirectoryEvidence extends PlanStoreRepoEvidence {
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

	constructor(params: {
		reason: NoSavedPlanAvailableReason;
		directoryPath: string;
		message: string;
	}) {
		super(params.message);
		this.name = "NoSavedPlanAvailableError";
		this.reason = params.reason;
		this.directoryPath = params.directoryPath;
	}
}

export function defaultPlanStoreRoot(
	env: Record<string, string | undefined> = process.env,
): string {
	return requireXdgPath(resolveNsXdgPath({ kind: "state", env, segments: ["enriched-plan"] }));
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

export function buildPlanStoreBranchDirectoryPath(params: {
	repoDirectoryPath: string;
	branchKey: string;
}): string {
	return join(params.repoDirectoryPath, params.branchKey);
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
	return await resolvePlanStoreRepoDirectoryFromContext(
		options,
		await resolvePlanStoreRepositoryContext(pi, options),
	);
}

export async function resolvePlanStoreDirectory(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<PlanStoreDirectoryEvidence> {
	const context = await resolvePlanStoreRepositoryContext(pi, options);
	const sourceBranch = await resolveCurrentBranch(context.git, options.cwd, options.signal);
	const repoDirectory = await resolvePlanStoreRepoDirectoryFromContext(options, context);
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	const directoryPath = buildPlanStoreBranchDirectoryPath({
		repoDirectoryPath: repoDirectory.repoDirectoryPath,
		branchKey,
	});

	return {
		...repoDirectory,
		sourceBranch,
		branchKey,
		directoryPath,
	};
}

export async function listSavedPlans(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<SavedPlanListItem[]> {
	const repoDirectory = await resolvePlanStoreRepoDirectory(pi, options);
	const planStoreGateway = resolvePlanStoreGateway(options);
	const plans: SavedPlanListItem[] = [];

	const branchEntries = await listDirectoryEntriesIfPresent(
		planStoreGateway,
		repoDirectory.repoDirectoryPath,
	);
	for (const branchEntry of branchEntries) {
		if (branchEntry.type !== "directory") {
			continue;
		}

		const branchKey = branchEntry.name;
		const branchDirectoryPath = join(repoDirectory.repoDirectoryPath, branchKey);
		const planEntries = await listDirectoryEntriesIfPresent(planStoreGateway, branchDirectoryPath);
		for (const planEntry of planEntries) {
			if (planEntry.type !== "file" || !planEntry.name.endsWith(PLAN_FILE_SUFFIX)) {
				continue;
			}

			const filePath = join(branchDirectoryPath, planEntry.name);
			const fileStat = await statFileIfRegular(planStoreGateway, filePath);
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
	const planStoreGateway = resolvePlanStoreGateway(options);
	const candidates: Array<{
		directory: PlanStoreDirectoryEvidence;
		fileName: string;
		filePath: string;
		modifiedTimeMs: number;
	}> = [];
	const directoryRead = await planStoreGateway.listDirectory(directory.directoryPath);
	const entries = directoryRead.type === "present" ? directoryRead.entries : [];
	for (const entry of entries) {
		if (entry.type !== "file" || !entry.name.endsWith(PLAN_FILE_SUFFIX)) {
			continue;
		}

		const filePath = join(directory.directoryPath, entry.name);
		const fileStat = await planStoreGateway.statPath(filePath);
		if (fileStat?.type !== "file") {
			continue;
		}
		candidates.push({
			directory,
			fileName: entry.name,
			filePath,
			modifiedTimeMs: fileStat.mtimeMs,
		});
	}

	if (directoryRead.type === "missing") {
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
		throw new Error(
			`No ${PLAN_FILE_DISPLAY_NAME} files exist in the local plan store directory ${directory.directoryPath}.`,
		);
	}

	return {
		...latest.directory,
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
	const planStoreGateway = resolvePlanStoreGateway(options);
	const fileName = buildPlanFileName(slug);
	const filePath = join(directory.directoryPath, fileName);

	await planStoreGateway.writeTextFileExclusive(filePath, params.content);

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

function resolvePrimaryPlanStoreRoot(options: PlanStoreOptions): string {
	return options.planStoreRoot ?? defaultPlanStoreRoot(options.env ?? process.env);
}

function resolvePlanStoreGateway(options: PlanStoreOptions): PlanStoreGateway {
	return options.planStoreGateway ?? createRealPlanStoreGateway();
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

async function resolveRequiredGitRepoRoot(
	git: GitGateway,
	cwd: string,
	signal: AbortSignal | undefined,
	planStoreGateway: PlanStoreGateway,
): Promise<string> {
	const root = await git.repoRoot({ cwd, signal });
	if (!root.ok) {
		throw new Error(root.error.message);
	}
	return await planStoreGateway.realpathOrResolve(root.value);
}

async function resolveCurrentBranch(
	git: GitGateway,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const branch = await git.currentBranch({ cwd, signal });
	if (branch.type === "branch") return branch.branch;
	if (branch.type === "detached") {
		throw new Error(
			"Current git checkout is detached or unnamed; check out a named branch before creating a saved plan file.",
		);
	}
	throw new Error(branch.error.message);
}

interface PlanStoreRepositoryContext {
	git: GitGateway;
	planStoreGateway: PlanStoreGateway;
	repoRoot: string;
}

interface RepoIdentityOptions {
	cwd: string;
	repoRoot: string;
	signal?: AbortSignal;
	planStoreGateway: PlanStoreGateway;
}

async function resolvePlanStoreRepositoryContext(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<PlanStoreRepositoryContext> {
	const git = options.git ?? new RealGitGateway(pi);
	const planStoreGateway = resolvePlanStoreGateway(options);
	const repoRoot = await resolveRequiredGitRepoRoot(
		git,
		options.cwd,
		options.signal,
		planStoreGateway,
	);

	return { git, planStoreGateway, repoRoot };
}

async function resolvePlanStoreRepoDirectoryFromContext(
	options: PlanStoreOptions,
	context: PlanStoreRepositoryContext,
): Promise<PlanStoreRepoEvidence> {
	const repoIdentity = await resolveRepoIdentity(
		context.git,
		buildRepoIdentityOptions(options, context.repoRoot, context.planStoreGateway),
	);
	const repoKey = buildRepoPlanStoreKey(context.repoRoot, repoIdentity.identity);
	const planStoreRoot = resolvePrimaryPlanStoreRoot(options);
	const repoDirectoryPath = join(planStoreRoot, repoKey);

	return {
		repoRoot: context.repoRoot,
		repoKey,
		repoIdentitySource: repoIdentity.source,
		repoDirectoryPath,
	};
}

function buildRepoIdentityOptions(
	options: PlanStoreOptions,
	repoRoot: string,
	planStoreGateway: PlanStoreGateway,
): RepoIdentityOptions {
	return {
		...buildGitCwdParams(options),
		repoRoot,
		planStoreGateway,
	};
}

function buildGitCwdParams(options: { cwd: string; signal?: AbortSignal }): {
	cwd: string;
	signal?: AbortSignal;
} {
	return {
		cwd: options.cwd,
		...optionalEntry("signal", options.signal),
	};
}

async function resolveRepoIdentity(
	git: GitGateway,
	options: RepoIdentityOptions,
): Promise<RepoIdentity> {
	const origin = await git.originUrl(buildGitCwdParams(options));
	if (origin.type === "error") {
		throw new Error(origin.error.message);
	}

	if (origin.type === "found") {
		const normalized = normalizeRepoOriginUrl(origin.value);
		if (normalized.length > 0) {
			return { source: "origin-url", identity: normalized };
		}
	}

	return {
		source: "repo-root",
		identity: await options.planStoreGateway.realpathOrResolve(options.repoRoot),
	};
}

async function listDirectoryEntriesIfPresent(
	planStoreGateway: PlanStoreGateway,
	path: string,
): Promise<readonly { name: string; type: "file" | "directory" | "other" }[]> {
	const read = await planStoreGateway.listDirectory(path);
	return read.type === "present" ? read.entries : [];
}

async function statFileIfRegular(
	planStoreGateway: PlanStoreGateway,
	path: string,
): Promise<{ mtimeMs: number } | undefined> {
	const fileStat = await planStoreGateway.statPath(path);
	return fileStat?.type === "file" ? { mtimeMs: fileStat.mtimeMs } : undefined;
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
	left: { filePath: string; modifiedTimeMs: number },
	right: { filePath: string; modifiedTimeMs: number },
): number {
	if (left.modifiedTimeMs !== right.modifiedTimeMs) {
		return right.modifiedTimeMs - left.modifiedTimeMs;
	}
	return right.filePath.localeCompare(left.filePath);
}

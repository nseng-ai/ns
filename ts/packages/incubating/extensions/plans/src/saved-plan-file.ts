import process from "node:process";
import { basename, join, resolve } from "node:path";

import type { Clock } from "@nseng-ai/foundation/clock";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { systemClock } from "@nseng-ai/foundation/time";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	githubRepositoryIdentityFromNormalizedRemoteUrl,
	normalizeGitRemoteUrl,
} from "@nseng-ai/extension-kit/github/identity";
import { normalizeSummary, validatePlanSlug } from "./plan-persistence.ts";
import {
	buildTimestampedSavedPlanFileName,
	formatLocalSavedPlanTimestamp,
	parseSavedPlanFileName,
	type ParsedSavedPlanName,
	type SavedPlanFormat,
} from "./saved-plan-format.ts";
import { createRealPlanStoreGateway, type PlanStoreGateway } from "./plan-store-gateway.ts";
import { requireXdgPath, resolveNsXdgPath } from "@nseng-ai/extension-kit/xdg";
import {
	isRecord,
	optionalEntries,
	optionalEntry,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";

const MAX_SEGMENT_LENGTH = 120;
const PLAN_FILE_SUFFIX = ".md";
const PLAN_FILE_DISPLAY_NAME = "timestamped Saved Plan";

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
	clock?: Clock;
	localTimestamp?: string;
}

interface BuildPlanStoreOptionsInput {
	cwd: string;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	planStoreRoot?: ExplicitUndefined<"di-seam", string>;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	git?: ExplicitUndefined<"di-seam", GitGateway>;
	planStoreGateway?: ExplicitUndefined<"di-seam", PlanStoreGateway>;
	clock?: ExplicitUndefined<"di-seam", Clock>;
	localTimestamp?: ExplicitUndefined<"di-seam", string>;
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
			clock: options.clock,
			localTimestamp: options.localTimestamp,
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

export interface SavedPlanListItem {
	repo: PlanStoreRepoEvidence;
	format: SavedPlanFormat;
	slug: string;
	timestamp: string;
	timestampNumber: number;
	sequence: number;
	branchKey: string;
	filePath: string;
	fileName: string;
	modifiedTimeMs: number;
}

export interface LatestSavedPlanFileEvidence {
	directory: PlanStoreDirectoryEvidence;
	format: "timestamped";
	slug: string;
	timestamp: string;
	timestampNumber: number;
	sequence: number;
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

export interface TimestampedDurableSavedPlan {
	directory: PlanStoreDirectoryEvidence;
	format: "timestamped";
	slug: string;
	filePath: string;
	fileName: string;
	fileStem: string;
	timestamp: string;
	timestampNumber: number;
	sequence: number;
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
			if (planEntry.type !== "file") continue;
			const parsedName = parseSavedPlanFileName(planEntry.name);
			if (parsedName === undefined) continue;

			const filePath = join(branchDirectoryPath, planEntry.name);
			const fileStat = await statFileIfRegular(planStoreGateway, filePath);
			if (fileStat === undefined) {
				continue;
			}

			plans.push({
				repo: repoDirectory,
				branchKey,
				format: parsedName.format,
				slug: parsedName.slug,
				timestamp: parsedName.timestamp,
				timestampNumber: parsedName.timestampNumber,
				sequence: parsedName.sequence,
				filePath,
				fileName: planEntry.name,
				modifiedTimeMs: fileStat.mtimeMs,
			});
		}
	}

	return plans.sort(compareSavedPlanRecency);
}

export async function findLatestSavedPlanFile(
	pi: CommandExecApi,
	options: PlanStoreOptions,
): Promise<LatestSavedPlanFileEvidence> {
	const directory = await resolvePlanStoreDirectory(pi, options);
	const planStoreGateway = resolvePlanStoreGateway(options);
	const candidates: Array<{
		directory: PlanStoreDirectoryEvidence;
		parsedName: ParsedSavedPlanName;
		filePath: string;
		modifiedTimeMs: number;
	}> = [];
	const directoryRead = await planStoreGateway.listDirectory(directory.directoryPath);
	const entries = directoryRead.type === "present" ? directoryRead.entries : [];
	for (const entry of entries) {
		if (entry.type !== "file") continue;
		const parsedName = parseSavedPlanFileName(entry.name);
		if (parsedName === undefined) continue;

		const filePath = join(directory.directoryPath, entry.name);
		const fileStat = await planStoreGateway.statPath(filePath);
		if (fileStat?.type !== "file") {
			continue;
		}
		candidates.push({
			directory,
			parsedName,
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

	const latest = candidates.sort(compareSavedPlanRecency)[0];
	if (latest === undefined) {
		throw new Error(
			`No ${PLAN_FILE_DISPLAY_NAME} files exist in the local plan store directory ${directory.directoryPath}.`,
		);
	}

	return {
		directory: latest.directory,
		format: latest.parsedName.format,
		slug: latest.parsedName.slug,
		timestamp: latest.parsedName.timestamp,
		timestampNumber: latest.parsedName.timestampNumber,
		sequence: latest.parsedName.sequence,
		filePath: latest.filePath,
		fileName: latest.parsedName.fileName,
		modifiedTimeMs: latest.modifiedTimeMs,
	};
}

export async function savePlanContentBytes(
	pi: CommandExecApi,
	slug: string,
	content: Uint8Array,
	options: PlanStoreOptions,
): Promise<TimestampedDurableSavedPlan> {
	const normalizedSlug = slug.trim();
	const slugError = validatePlanSlug(normalizedSlug);
	if (slugError !== undefined) {
		throw new Error(`Invalid saved plan slug: ${slugError}`);
	}
	const decodedContent = decodeSavedPlanContent(content);
	if (decodedContent.trim().length === 0) {
		throw new Error("Saved plan content must contain non-whitespace text.");
	}
	const directory = await resolvePlanStoreDirectory(pi, options);
	const timestamp =
		options.localTimestamp ?? formatLocalSavedPlanTimestamp((options.clock ?? systemClock).nowMs());
	const planStoreGateway = resolvePlanStoreGateway(options);
	const sequence = await nextSavedPlanSequence(
		planStoreGateway,
		directory.directoryPath,
		timestamp,
	);
	const fileName = buildTimestampedSavedPlanFileName(normalizedSlug, timestamp, sequence);
	const filePath = join(directory.directoryPath, fileName);
	await planStoreGateway.writeBytesExclusive(filePath, content);
	return {
		directory,
		format: "timestamped",
		slug: normalizedSlug,
		filePath,
		fileName,
		fileStem: fileName.slice(0, -PLAN_FILE_SUFFIX.length),
		timestamp,
		timestampNumber: Number(timestamp.replace(/\D/g, "")),
		sequence,
	};
}

async function nextSavedPlanSequence(
	planStoreGateway: PlanStoreGateway,
	directoryPath: string,
	timestamp: string,
): Promise<number> {
	const directory = await planStoreGateway.listDirectory(directoryPath);
	if (directory.type === "missing") return 1;
	let greatest = 0;
	for (const entry of directory.entries) {
		if (entry.type !== "file") continue;
		const parsed = parseSavedPlanFileName(entry.name);
		if (parsed?.format !== "timestamped" || parsed.timestamp !== timestamp) continue;
		greatest = Math.max(greatest, parsed.sequence);
	}
	return greatest + 1;
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

	const savedPlan = await savePlanContentBytes(
		pi,
		slug,
		new TextEncoder().encode(params.content),
		options,
	);
	const evidence = {
		slug,
		repoRoot: savedPlan.directory.repoRoot,
		repoKey: savedPlan.directory.repoKey,
		repoIdentitySource: savedPlan.directory.repoIdentitySource,
		sourceBranch: savedPlan.directory.sourceBranch,
		branchKey: savedPlan.directory.branchKey,
		filePath: savedPlan.filePath,
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

function decodeSavedPlanContent(content: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(content);
	} catch {
		throw new Error("Saved plan content must be valid UTF-8.");
	}
}

function compareSavedPlanRecency(
	left: { filePath: string; modifiedTimeMs: number },
	right: { filePath: string; modifiedTimeMs: number },
): number {
	if (left.modifiedTimeMs !== right.modifiedTimeMs) {
		return right.modifiedTimeMs - left.modifiedTimeMs;
	}
	return right.filePath.localeCompare(left.filePath);
}

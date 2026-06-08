import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import {
	buildPlanFileName,
	findLatestSourceBranchPlanFile,
	findLatestSourceBranchTsPlanFile,
	planFileFormatForKind,
	planFileSuffixForKind,
	resolvePlanStoreDirectory,
	type LatestSourceBranchPlanFileEvidence,
	type PlanFileKind,
	type PlanStoreDirectoryEvidence,
	type SourceBranchPlanFileEvidence,
	type SourceBranchPlanFileOptions,
} from "./source-plan-file.ts";
import { isPathInside, normalizePlanFilePath, validatePlanSlug, type PlanCommandExecApi } from "./plan-persistence.ts";
import { isRecord } from "./primitives.ts";

export const WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME = planFileFormatForKind("markdown").writeToolName;
export const WRITE_SOURCE_BRANCH_TS_PLAN_FILE_TOOL_NAME = planFileFormatForKind("typescript-recipe").writeToolName;

export type ValidatedSessionSavedPlan = LatestSourceBranchPlanFileEvidence & {
	summary?: string;
};

export type SessionSavedPlanValidation =
	| { type: "valid"; plan: ValidatedSessionSavedPlan }
	| { type: "stale"; reason: string }
	| { type: "unsafe"; message: string };

export type LatestSessionSavedPlanResult =
	| { type: "found"; plan: ValidatedSessionSavedPlan }
	| { type: "not-found" }
	| { type: "unsafe"; message: string };

export type SelectedSavedPlanFile =
	| {
			type: "explicit";
			filePath: string;
			fileName: string;
			savedPlanFileStem: string;
	  }
	| {
			type: "session";
			plan: ValidatedSessionSavedPlan;
			savedPlanFileStem: string;
	  }
	| {
			type: "latest";
			plan: LatestSourceBranchPlanFileEvidence;
			savedPlanFileStem: string;
	  };

export interface ResolveSelectedSavedPlanFileOptions extends SourceBranchPlanFileOptions {
	explicitPath?: string | undefined;
	sessionEntries?: readonly unknown[] | undefined;
	shouldFallbackToLatest?: boolean | undefined;
}

export function extractSourceBranchPlanFileEvidenceFromSessionEntry(
	entry: unknown,
	options: { toolName?: string } = {},
): SourceBranchPlanFileEvidence | undefined {
	if (!isRecord(entry) || entry.type !== "message") {
		return undefined;
	}

	const message = entry.message;
	if (!isRecord(message) || message.role !== "toolResult") {
		return undefined;
	}
	if ((message.toolName ?? undefined) !== (options.toolName ?? WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME) || message.isError === true) {
		return undefined;
	}

	const details = message.details;
	if (!isRecord(details)) {
		return undefined;
	}

	return parseSourceBranchPlanFileEvidence(details);
}

export async function validateSessionSavedPlanCandidate(
	evidence: SourceBranchPlanFileEvidence,
	directory: PlanStoreDirectoryEvidence,
): Promise<SessionSavedPlanValidation> {
	return validateSessionSavedPlanCandidateForKind(evidence, directory, "markdown");
}

export async function validateSessionSavedTsPlanCandidate(
	evidence: SourceBranchPlanFileEvidence,
	directory: PlanStoreDirectoryEvidence,
): Promise<SessionSavedPlanValidation> {
	return validateSessionSavedPlanCandidateForKind(evidence, directory, "typescript-recipe");
}

async function validateSessionSavedPlanCandidateForKind(
	evidence: SourceBranchPlanFileEvidence,
	directory: PlanStoreDirectoryEvidence,
	kind: PlanFileKind,
): Promise<SessionSavedPlanValidation> {
	const suffix = planFileSuffixForKind(kind);
	if (!isAbsolute(evidence.filePath)) {
		return unsafe(`Session saved-plan evidence file path must be absolute: ${evidence.filePath || "(empty)"}`);
	}
	if (!evidence.filePath.endsWith(suffix)) {
		return unsafe(`Session saved-plan evidence file path must use a ${suffix} filename: ${evidence.filePath}`);
	}

	const slugError = validatePlanSlug(evidence.slug);
	if (slugError !== undefined) {
		return unsafe(`Session saved-plan evidence has an invalid slug ${JSON.stringify(evidence.slug)}: ${slugError}`);
	}

	const fileName = basename(evidence.filePath);
	const expectedFileName = buildPlanFileName(evidence.slug, kind);
	if (fileName !== expectedFileName) {
		return unsafe(`Session saved-plan evidence basename must match slug: expected ${expectedFileName}, got ${fileName || "(empty)"}.`);
	}

	const metadataError = validateDirectoryMetadata(evidence, directory);
	if (metadataError !== undefined) {
		return unsafe(metadataError);
	}

	if (!isPathInside(directory.directoryPath, evidence.filePath)) {
		return unsafe(
			[
				"Session saved-plan evidence points outside the current local plan store directory.",
				`Plan store directory: ${directory.directoryPath}`,
				`Saved plan path: ${evidence.filePath}`,
			].join("\n"),
		);
	}

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(evidence.filePath);
	} catch {
		return { type: "stale", reason: `Saved plan file no longer exists or is not accessible: ${evidence.filePath}` };
	}
	if (!fileStat.isFile()) {
		return unsafe(`Session saved-plan evidence path is not a regular file: ${evidence.filePath}`);
	}

	const realDirectoryPath = await realpathIfPossible(directory.directoryPath);
	const realFilePath = await realpathIfPossible(evidence.filePath);
	if (!isPathInside(realDirectoryPath, realFilePath)) {
		return unsafe(
			[
				"Session saved-plan evidence resolves outside the current local plan store directory.",
				`Plan store directory: ${directory.directoryPath}`,
				`Resolved plan store directory: ${realDirectoryPath}`,
				`Saved plan path: ${evidence.filePath}`,
				`Resolved saved plan path: ${realFilePath}`,
			].join("\n"),
		);
	}

	const plan: ValidatedSessionSavedPlan = {
		...directory,
		slug: evidence.slug,
		filePath: evidence.filePath,
		fileName,
		modifiedTimeMs: fileStat.mtimeMs,
		...(evidence.summary === undefined ? {} : { summary: evidence.summary }),
	};
	return { type: "valid", plan };
}

export async function findLatestSessionSavedPlanFile(
	entries: readonly unknown[],
	directory: PlanStoreDirectoryEvidence,
): Promise<LatestSessionSavedPlanResult> {
	return findLatestSessionSavedPlanFileForKind(entries, directory, "markdown");
}

export async function findLatestSessionSavedTsPlanFile(
	entries: readonly unknown[],
	directory: PlanStoreDirectoryEvidence,
): Promise<LatestSessionSavedPlanResult> {
	return findLatestSessionSavedPlanFileForKind(entries, directory, "typescript-recipe");
}

async function findLatestSessionSavedPlanFileForKind(
	entries: readonly unknown[],
	directory: PlanStoreDirectoryEvidence,
	kind: PlanFileKind,
): Promise<LatestSessionSavedPlanResult> {
	const toolName = planFileFormatForKind(kind).writeToolName;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		const evidence = extractSourceBranchPlanFileEvidenceFromSessionEntry(entry, { toolName });
		if (evidence === undefined) {
			continue;
		}

		const validation = await validateSessionSavedPlanCandidateForKind(evidence, directory, kind);
		switch (validation.type) {
			case "valid":
				return { type: "found", plan: validation.plan };
			case "stale":
				continue;
			case "unsafe":
				return validation;
		}
	}

	return { type: "not-found" };
}

export async function resolveSelectedSavedPlanFile(
	pi: PlanCommandExecApi,
	options: ResolveSelectedSavedPlanFileOptions,
): Promise<SelectedSavedPlanFile> {
	return resolveSelectedSavedPlanFileForKind(pi, options, "markdown");
}

export async function resolveSelectedSavedTsPlanFile(
	pi: PlanCommandExecApi,
	options: ResolveSelectedSavedPlanFileOptions,
): Promise<SelectedSavedPlanFile> {
	return resolveSelectedSavedPlanFileForKind(pi, options, "typescript-recipe");
}

async function resolveSelectedSavedPlanFileForKind(
	pi: PlanCommandExecApi,
	options: ResolveSelectedSavedPlanFileOptions,
	kind: PlanFileKind,
): Promise<SelectedSavedPlanFile> {
	const format = planFileFormatForKind(kind);
	const suffix = format.suffix;
	if (options.explicitPath !== undefined) {
		const filePath = normalizePlanFilePath(options.explicitPath);
		if (!isAbsolute(filePath)) {
			throw new Error(`Plan file path must be absolute or home-relative for ${format.createCommand}; got ${filePath || "(empty)"}.`);
		}

		const fileName = basename(filePath);
		if (!fileName.endsWith(suffix)) {
			throw new Error(`Plan file must use a ${suffix} filename; got ${fileName || "(empty)"}.`);
		}

		return { type: "explicit", savedPlanFileStem: fileName.slice(0, -suffix.length), filePath, fileName };
	}

	const sessionEntries = options.sessionEntries ?? [];
	if (sessionEntries.length > 0) {
		const directory = await resolvePlanStoreDirectory(pi, options);
		const sessionResult = await findLatestSessionSavedPlanFileForKind(sessionEntries, directory, kind);
		switch (sessionResult.type) {
			case "found":
				return { type: "session", plan: sessionResult.plan, savedPlanFileStem: sessionResult.plan.slug };
			case "unsafe":
				throw new Error(sessionResult.message);
			case "not-found":
				break;
		}
	}

	if (options.shouldFallbackToLatest ?? false) {
		const latest = kind === "markdown" ? await findLatestSourceBranchPlanFile(pi, options) : await findLatestSourceBranchTsPlanFile(pi, options);
		return { type: "latest", plan: latest, savedPlanFileStem: latest.slug };
	}

	throw new Error(`No usable saved plan from ${format.writeCommand} was found in the current session branch.`);
}

function parseSourceBranchPlanFileEvidence(details: Record<string, unknown>): SourceBranchPlanFileEvidence | undefined {
	const slug = details.slug;
	const repoRoot = details.repoRoot;
	const repoKey = details.repoKey;
	const repoIdentitySource = details.repoIdentitySource;
	const sourceBranch = details.sourceBranch;
	const branchKey = details.branchKey;
	const filePath = details.filePath;
	if (
		typeof slug !== "string" ||
		typeof repoRoot !== "string" ||
		typeof repoKey !== "string" ||
		typeof sourceBranch !== "string" ||
		typeof branchKey !== "string" ||
		typeof filePath !== "string"
	) {
		return undefined;
	}
	if (repoIdentitySource !== "origin-url" && repoIdentitySource !== "repo-root") {
		return undefined;
	}

	const evidence: SourceBranchPlanFileEvidence = {
		slug,
		repoRoot,
		repoKey,
		repoIdentitySource,
		sourceBranch,
		branchKey,
		filePath,
	};
	const summary = details.summary;
	if (summary === undefined) {
		return evidence;
	}
	if (typeof summary !== "string") {
		return undefined;
	}
	return { ...evidence, summary };
}

function validateDirectoryMetadata(evidence: SourceBranchPlanFileEvidence, directory: PlanStoreDirectoryEvidence): string | undefined {
	const mismatches: string[] = [];
	if (evidence.repoRoot !== directory.repoRoot) {
		mismatches.push(`repoRoot: evidence ${evidence.repoRoot}, current ${directory.repoRoot}`);
	}
	if (evidence.repoKey !== directory.repoKey) {
		mismatches.push(`repoKey: evidence ${evidence.repoKey}, current ${directory.repoKey}`);
	}
	if (evidence.repoIdentitySource !== directory.repoIdentitySource) {
		mismatches.push(`repoIdentitySource: evidence ${evidence.repoIdentitySource}, current ${directory.repoIdentitySource}`);
	}
	if (evidence.sourceBranch !== directory.sourceBranch) {
		mismatches.push(`sourceBranch: evidence ${evidence.sourceBranch}, current ${directory.sourceBranch}`);
	}
	if (evidence.branchKey !== directory.branchKey) {
		mismatches.push(`branchKey: evidence ${evidence.branchKey}, current ${directory.branchKey}`);
	}
	if (mismatches.length === 0) {
		return undefined;
	}
	return ["Latest saved plan belongs to a different repo or branch than the current checkout.", ...mismatches].join("\n");
}

function unsafe(message: string): SessionSavedPlanValidation {
	return { type: "unsafe", message };
}

async function realpathIfPossible(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

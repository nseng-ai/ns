import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import {
	buildPlanFileName,
	findLatestSavedPlanFile,
	resolvePlanStoreDirectory,
	type LatestSavedPlanFileEvidence,
	type PlanStoreDirectoryEvidence,
	type SavedPlanFileEvidence,
	type PlanStoreOptions,
} from "./saved-plan-file.ts";
import type { PlanCommandExecApi } from "./command-runtime.ts";
import { isPathInside, normalizePlanFilePath, validatePlanSlug } from "./plan-persistence.ts";
import { isRecord } from "@asdl/core/primitives";

export const WRITE_SAVED_PLAN_FILE_TOOL_NAME = "write_saved_plan_file";

export type ValidatedSessionSavedPlan = LatestSavedPlanFileEvidence & {
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
			plan: LatestSavedPlanFileEvidence;
			savedPlanFileStem: string;
	  };

export interface ResolveSelectedSavedPlanFileOptions extends PlanStoreOptions {
	explicitPath?: string | undefined;
	sessionEntries?: readonly unknown[] | undefined;
	shouldFallbackToLatest?: boolean | undefined;
}

export function extractSavedPlanFileEvidenceFromSessionEntry(entry: unknown): SavedPlanFileEvidence | undefined {
	if (!isRecord(entry) || entry.type !== "message") {
		return undefined;
	}

	const message = entry.message;
	if (!isRecord(message) || message.role !== "toolResult") {
		return undefined;
	}
	if ((message.toolName ?? undefined) !== WRITE_SAVED_PLAN_FILE_TOOL_NAME || message.isError === true) {
		return undefined;
	}

	const details = message.details;
	if (!isRecord(details)) {
		return undefined;
	}

	return parseSavedPlanFileEvidence(details);
}

export async function validateSessionSavedPlanCandidate(
	evidence: SavedPlanFileEvidence,
	directory: PlanStoreDirectoryEvidence,
): Promise<SessionSavedPlanValidation> {
	if (!isAbsolute(evidence.filePath)) {
		return unsafe(`Session saved-plan evidence file path must be absolute: ${evidence.filePath || "(empty)"}`);
	}
	if (!evidence.filePath.endsWith(".md")) {
		return unsafe(`Session saved-plan evidence file path must use a .md filename: ${evidence.filePath}`);
	}

	const slugError = validatePlanSlug(evidence.slug);
	if (slugError !== undefined) {
		return unsafe(`Session saved-plan evidence has an invalid slug ${JSON.stringify(evidence.slug)}: ${slugError}`);
	}

	const fileName = basename(evidence.filePath);
	const expectedFileName = buildPlanFileName(evidence.slug);
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
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		const evidence = extractSavedPlanFileEvidenceFromSessionEntry(entry);
		if (evidence === undefined) {
			continue;
		}

		const validation = await validateSessionSavedPlanCandidate(evidence, directory);
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
	if (options.explicitPath !== undefined) {
		const filePath = normalizePlanFilePath(options.explicitPath);
		if (!isAbsolute(filePath)) {
			throw new Error(`Plan file path must be absolute or home-relative; got ${filePath || "(empty)"}.`);
		}

		const fileName = basename(filePath);
		if (!fileName.endsWith(".md")) {
			throw new Error(`Plan file must use a .md filename; got ${fileName || "(empty)"}.`);
		}

		return { type: "explicit", savedPlanFileStem: fileName.slice(0, -".md".length), filePath, fileName };
	}

	const sessionEntries = options.sessionEntries ?? [];
	if (sessionEntries.length > 0) {
		const directory = await resolvePlanStoreDirectory(pi, options);
		const sessionResult = await findLatestSessionSavedPlanFile(sessionEntries, directory);
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
		const latest = await findLatestSavedPlanFile(pi, options);
		return { type: "latest", plan: latest, savedPlanFileStem: latest.slug };
	}

	throw new Error("No usable saved plan was found in the current session branch.");
}

function parseSavedPlanFileEvidence(details: Record<string, unknown>): SavedPlanFileEvidence | undefined {
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

	const evidence: SavedPlanFileEvidence = {
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

function validateDirectoryMetadata(evidence: SavedPlanFileEvidence, directory: PlanStoreDirectoryEvidence): string | undefined {
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

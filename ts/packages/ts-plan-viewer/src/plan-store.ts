import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface TsPlanViewerOptions {
	planStoreRoot: string;
	cwd: string;
}

export interface SavedTsPlanSummary {
	id: string;
	source: "saved";
	repoKey: string;
	branchKey: string;
	fileName: string;
	slug: string;
	filePath: string;
	modifiedTimeMs: number;
	byteCount: number;
}

export interface ResolvedSavedTsPlanPath {
	filePath: string;
	relativePath: string;
}

export type PlanStoreFailureCode = "invalid-id" | "not-found" | "read-failed";

export type ResolveSavedTsPlanPathResult =
	| { type: "success"; plan: ResolvedSavedTsPlanPath }
	| { type: "failure"; code: PlanStoreFailureCode; message: string };

export type ReadSavedTsPlanSourceResult =
	| { type: "success"; source: string; filePath: string }
	| { type: "failure"; code: PlanStoreFailureCode; message: string };

const TS_PLAN_SUFFIX = ".plan.ts";

export async function listSavedTsPlans(planStoreRoot: string): Promise<SavedTsPlanSummary[]> {
	const root = resolve(planStoreRoot);
	const repoEntries = await readDirectoryEntries(root);
	if (repoEntries.type === "missing") return [];
	if (repoEntries.type === "failure") throw repoEntries.error;

	const summaries: SavedTsPlanSummary[] = [];
	for (const repoEntry of repoEntries.entries) {
		if (!repoEntry.isDirectory()) continue;
		const repoKey = repoEntry.name;
		const branchEntries = await readDirectoryEntries(join(root, repoKey));
		if (branchEntries.type !== "success") continue;

		for (const branchEntry of branchEntries.entries) {
			if (!branchEntry.isDirectory()) continue;
			const branchKey = branchEntry.name;
			const planEntries = await readDirectoryEntries(join(root, repoKey, branchKey));
			if (planEntries.type !== "success") continue;

			for (const planEntry of planEntries.entries) {
				if (!planEntry.isFile() || !planEntry.name.endsWith(TS_PLAN_SUFFIX)) continue;
				const filePath = join(root, repoKey, branchKey, planEntry.name);
				const fileStats = await stat(filePath);
				summaries.push({
					id: encodeSavedTsPlanId(`${repoKey}/${branchKey}/${planEntry.name}`),
					source: "saved",
					repoKey,
					branchKey,
					fileName: planEntry.name,
					slug: planEntry.name.slice(0, -TS_PLAN_SUFFIX.length),
					filePath,
					modifiedTimeMs: fileStats.mtimeMs,
					byteCount: fileStats.size,
				});
			}
		}
	}

	return summaries.sort((left, right) => right.modifiedTimeMs - left.modifiedTimeMs || left.filePath.localeCompare(right.filePath));
}

export function encodeSavedTsPlanId(relativePath: string): string {
	return Buffer.from(relativePath, "utf8").toString("base64url");
}

export function resolveSavedTsPlanPathFromId(planStoreRoot: string, id: string): ResolveSavedTsPlanPathResult {
	const decoded = decodeSavedTsPlanId(id);
	if (decoded.type === "failure") return decoded;

	const segments = decoded.plan.relativePath.split("/");
	if (segments.length !== 3) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id must identify a repo, source branch, and .plan.ts file." };
	}

	const [repoKey, branchKey, fileName] = segments;
	if (!isSafePlanPathSegment(repoKey) || !isSafePlanPathSegment(branchKey) || !isSafePlanPathSegment(fileName)) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id contains an unsafe path segment." };
	}

	if (!fileName.endsWith(TS_PLAN_SUFFIX)) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id must end with .plan.ts." };
	}

	const rootPath = resolve(planStoreRoot);
	const filePath = resolve(rootPath, repoKey, branchKey, fileName);
	if (!isPathInside(rootPath, filePath)) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id resolves outside the configured plan store root." };
	}

	return { type: "success", plan: { filePath, relativePath: `${repoKey}/${branchKey}/${fileName}` } };
}

export async function readSavedTsPlanSource(planStoreRoot: string, id: string): Promise<ReadSavedTsPlanSourceResult> {
	const resolvedPlan = resolveSavedTsPlanPathFromId(planStoreRoot, id);
	if (resolvedPlan.type === "failure") return resolvedPlan;

	try {
		const source = await readFile(resolvedPlan.plan.filePath, "utf8");
		return { type: "success", source, filePath: resolvedPlan.plan.filePath };
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) {
			return { type: "failure", code: "not-found", message: "Saved TypeScript plan was not found." };
		}
		return { type: "failure", code: "read-failed", message: errorToMessage(error) };
	}
}

function decodeSavedTsPlanId(id: string): ResolveSavedTsPlanPathResult {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id is not a valid opaque id." };
	}

	const relativePath = Buffer.from(id, "base64url").toString("utf8");
	if (Buffer.from(relativePath, "utf8").toString("base64url") !== id) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id is not canonical." };
	}

	if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) {
		return { type: "failure", code: "invalid-id", message: "Saved plan id does not encode a safe relative path." };
	}

	return { type: "success", plan: { filePath: relativePath, relativePath } };
}

function isSafePlanPathSegment(segment: string | undefined): segment is string {
	return segment !== undefined && segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes("/") && !segment.includes("\\") && !segment.includes("\0");
}

function isPathInside(rootPath: string, filePath: string): boolean {
	const relativePath = relative(rootPath, filePath);
	return relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

type DirectoryReadResult =
	| { type: "success"; entries: Dirent[] }
	| { type: "missing" }
	| { type: "failure"; error: unknown };

async function readDirectoryEntries(directoryPath: string): Promise<DirectoryReadResult> {
	try {
		return { type: "success", entries: await readdir(directoryPath, { withFileTypes: true }) };
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
		return { type: "failure", error };
	}
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown plan store error.";
}

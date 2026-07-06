import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { mapFromRecordOrMap, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewCatalogFailure, ReviewResult } from "../core/failures.ts";
import { isMissingFileError } from "./filesystem-errors.ts";

const NS_DIRNAME = ".ns";
const REVIEWS_DIRNAME = "reviews";

export interface ReviewSource {
	readonly key: string;
	readonly path: string;
	readonly source: string;
}

export interface ReviewCatalog {
	readonly reviewsDir: string;
	readonly keys: readonly string[];
}

export interface ReviewCatalogGateway {
	listReviewKeys(options: {
		readonly cwd: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewCatalog>>;
	loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewSource>>;
}

export interface RealReviewCatalogGatewayOptions {
	readonly gitGateway?: GitGateway;
}

export class RealReviewCatalogGateway implements ReviewCatalogGateway {
	private readonly gitGateway: GitGateway;

	constructor(options: RealReviewCatalogGatewayOptions = {}) {
		this.gitGateway = options.gitGateway ?? new RealGitGateway(new NodeCommandExecApi());
	}

	async listReviewKeys(options: {
		readonly cwd: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewCatalog>> {
		const reviewsDir = await this.reviewsDir(options.cwd, options.signal);
		if (!reviewsDir.ok) return reviewsDir;

		const requiredReviewsDir = await requireReviewsDirectory(reviewsDir.value);
		if (!requiredReviewsDir.ok) return requiredReviewsDir;

		const records = await reviewRecordDirectories(requiredReviewsDir.value);
		return {
			ok: true,
			value: {
				reviewsDir: reviewsDir.value,
				keys: records,
			},
		};
	}

	async loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewSource>> {
		const reviewsDir = await this.reviewsDir(options.cwd, options.signal);
		if (!reviewsDir.ok) return reviewsDir;
		const resolved = await resolveReviewPath(reviewsDir.value, options.key);
		if (!resolved.ok) return resolved;

		const status = await directoryStatus(resolved.value.path);
		if (status === "missing") {
			return error({
				code: "review-definition-not-found",
				message: `No review found for key ${JSON.stringify(options.key)} at ${resolved.value.path}.`,
			});
		}
		if (status !== "file") {
			return error({
				code: "review-definition-not-file",
				message: `Review definition is not a file: ${resolved.value.path}`,
			});
		}

		try {
			const source = await readFile(resolved.value.path, "utf8");
			return { ok: true, value: { key: resolved.value.key, path: resolved.value.path, source } };
		} catch (caught) {
			return error({
				code: "review-definition-read-failed",
				message: `Unable to read review definition ${resolved.value.path}: ${caught instanceof Error ? caught.message : String(caught)}`,
			});
		}
	}

	private async reviewsDir(
		cwd: string,
		signal: AbortSignal | undefined,
	): Promise<ReviewResult<string>> {
		const repoRoot = await this.gitGateway.repoRoot({ cwd, signal });
		if (!repoRoot.ok)
			return error({ code: "reviews-dir-missing", message: repoRoot.error.message });
		return { ok: true, value: join(repoRoot.value, NS_DIRNAME, REVIEWS_DIRNAME) };
	}
}

export interface FakeReviewCatalogGatewayOptions {
	readonly reviewSourcesByKey?: Readonly<Record<string, string>> | ReadonlyMap<string, string>;
	readonly reviewSourceFailuresByKey?:
		| Readonly<Record<string, ReviewCatalogFailure>>
		| ReadonlyMap<string, ReviewCatalogFailure>;
	readonly reviewKeys?: readonly string[];
	readonly listReviewKeysFailure?: ReviewCatalogFailure;
	readonly reviewsDir?: string;
}

export class FakeReviewCatalogGateway implements ReviewCatalogGateway {
	private readonly reviewSourcesByKey: Map<string, string>;
	private readonly reviewSourceFailuresByKey: Map<string, ReviewCatalogFailure>;
	private readonly reviewKeys: readonly string[] | null;
	private readonly listReviewKeysFailure: ReviewCatalogFailure | null;
	private readonly reviewsDirValue: string;
	private readonly requestedReviewKeysInternal: string[] = [];

	constructor(options: FakeReviewCatalogGatewayOptions = {}) {
		this.reviewSourcesByKey = mapFromRecordOrMap(options.reviewSourcesByKey);
		this.reviewSourceFailuresByKey = mapFromRecordOrMap(options.reviewSourceFailuresByKey);
		this.reviewKeys = options.reviewKeys === undefined ? null : [...options.reviewKeys];
		this.listReviewKeysFailure = options.listReviewKeysFailure ?? null;
		this.reviewsDirValue = options.reviewsDir ?? "/repo/.ns/reviews";
	}

	async listReviewKeys(_options: {
		readonly cwd: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewCatalog>> {
		if (this.listReviewKeysFailure !== null) return error({ ...this.listReviewKeysFailure });
		const keys =
			this.reviewKeys === null ? [...this.reviewSourcesByKey.keys()].sort() : [...this.reviewKeys];
		return { ok: true, value: { reviewsDir: this.reviewsDirValue, keys } };
	}

	async loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	}): Promise<ReviewResult<ReviewSource>> {
		this.requestedReviewKeysInternal.push(options.key);
		const configuredFailure = this.reviewSourceFailuresByKey.get(options.key);
		if (configuredFailure !== undefined) return error({ ...configuredFailure });
		const source = this.reviewSourcesByKey.get(options.key);
		const path = reviewPathForKey(this.reviewsDirValue, options.key);
		if (source === undefined) {
			return error({
				code: "review-definition-not-found",
				message: `No fake review definition configured for key ${JSON.stringify(options.key)} at ${path}.`,
			});
		}
		return {
			ok: true,
			value: { key: options.key, path, source },
		};
	}

	requestedReviewKeys(): readonly string[] {
		return [...this.requestedReviewKeysInternal];
	}
}

interface ResolvedReviewPath {
	readonly key: string;
	readonly path: string;
}

async function resolveReviewPath(
	reviewsDir: string,
	key: string,
): Promise<ReviewResult<ResolvedReviewPath>> {
	const normalized = key.trim();
	if (normalized === "")
		return error({
			code: "review-key-invalid",
			message: "Review key must not be empty.",
		});
	if (!isValidReviewKeyName(normalized)) {
		return error({
			code: "review-key-invalid",
			message: `Review key must be a direct folder name without slashes, backslashes, absolute paths, or traversal: ${JSON.stringify(key)}`,
		});
	}

	const requiredReviewsDir = await requireReviewsDirectory(reviewsDir);
	if (!requiredReviewsDir.ok) return requiredReviewsDir;

	const path = reviewPathForKey(requiredReviewsDir.value, normalized);
	const rel = relative(requiredReviewsDir.value, path);
	if (rel.startsWith("..") || rel === "" || rel.startsWith(sep)) {
		return error({
			code: "review-key-invalid",
			message: `Review key ${JSON.stringify(key)} resolves outside ${requiredReviewsDir.value}.`,
		});
	}
	return { ok: true, value: { key: normalized, path } };
}

async function requireReviewsDirectory(reviewsDir: string): Promise<ReviewResult<string>> {
	const status = await directoryStatus(reviewsDir);
	if (status === "missing") {
		return error({
			code: "reviews-dir-missing",
			message: `No reviews directory at ${reviewsDir}. Create it and add \`<key>/review.md\` definitions.`,
		});
	}
	if (status !== "directory") {
		return error({
			code: "reviews-dir-not-directory",
			message: `Reviews path is not a directory: ${reviewsDir}`,
		});
	}
	return { ok: true, value: reviewsDir };
}

async function reviewRecordDirectories(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const keys: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !isValidReviewKeyName(entry.name)) continue;
		const status = await directoryStatus(reviewPathForKey(root, entry.name));
		if (status === "file") keys.push(entry.name);
	}
	return keys.sort((left, right) => left.localeCompare(right));
}

function reviewPathForKey(reviewsDir: string, key: string): string {
	return join(reviewsDir, key, "review.md");
}

function isValidReviewKeyName(key: string): boolean {
	return (
		key !== "" &&
		key !== "." &&
		key !== ".." &&
		!isAbsolute(key) &&
		!key.includes("/") &&
		!key.includes("\\")
	);
}

type PathStatus = "missing" | "file" | "directory" | "other";

async function directoryStatus(path: string): Promise<PathStatus> {
	try {
		const item = await stat(path);
		if (item.isFile()) return "file";
		if (item.isDirectory()) return "directory";
		return "other";
	} catch (caught) {
		if (isMissingFileError(caught)) return "missing";
		return "other";
	}
}

function error(errorValue: ReviewCatalogFailure): ReviewResult<never> {
	return resultErr(errorValue);
}

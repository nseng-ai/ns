import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { NodeCommandExecApi } from "@asdl/core/exec";
import { type GitGateway, RealGitGateway } from "@asdl/core/git";
import { mapFromRecordOrMap } from "@asdl/core/primitives";

import type { ReviewCatalogFailure, RoasterResult } from "../failures.ts";
import { isMissingFileError } from "./filesystem-errors.ts";

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
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewCatalog>>;
	loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewSource>>;
}

export interface RealReviewCatalogGatewayOptions {
	readonly gitGateway?: GitGateway | undefined;
}

export class RealReviewCatalogGateway implements ReviewCatalogGateway {
	private readonly gitGateway: GitGateway;

	constructor(options: RealReviewCatalogGatewayOptions = {}) {
		this.gitGateway = options.gitGateway ?? new RealGitGateway(new NodeCommandExecApi());
	}

	async listReviewKeys(options: {
		readonly cwd: string;
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewCatalog>> {
		const reviewsDir = await this.reviewsDir(options.cwd, options.signal);
		if (reviewsDir.type === "error") return reviewsDir;

		const status = await directoryStatus(reviewsDir.value);
		if (status === "missing") {
			return error({
				type: "reviews_dir_missing",
				message: `No reviews directory at ${reviewsDir.value}. Create it and add \`<key>.md\` files.`,
			});
		}
		if (status !== "directory") {
			return error({
				type: "reviews_dir_not_directory",
				message: `Reviews path is not a directory: ${reviewsDir.value}`,
			});
		}

		const paths = await markdownFiles(reviewsDir.value);
		return {
			type: "ok",
			value: {
				reviewsDir: reviewsDir.value,
				keys: paths.map((path) => keyFromPath(reviewsDir.value, path)).sort(),
			},
		};
	}

	async loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewSource>> {
		const reviewsDir = await this.reviewsDir(options.cwd, options.signal);
		if (reviewsDir.type === "error") return reviewsDir;
		const resolved = await resolveReviewPath(reviewsDir.value, options.key);
		if (resolved.type === "error") return resolved;

		const status = await directoryStatus(resolved.value.path);
		if (status === "missing") {
			return error({
				type: "review_definition_not_found",
				message: `No review found for key ${JSON.stringify(options.key)} at ${resolved.value.path}.`,
				reviewKey: options.key,
				path: resolved.value.path,
			});
		}
		if (status !== "file") {
			return error({
				type: "review_definition_not_file",
				message: `Review definition is not a file: ${resolved.value.path}`,
				reviewKey: options.key,
				path: resolved.value.path,
			});
		}

		try {
			const source = await readFile(resolved.value.path, "utf8");
			return { type: "ok", value: { key: resolved.value.key, path: resolved.value.path, source } };
		} catch (caught) {
			return error({
				type: "review_definition_read_failed",
				message: `Unable to read review definition ${resolved.value.path}: ${caught instanceof Error ? caught.message : String(caught)}`,
				reviewKey: resolved.value.key,
				path: resolved.value.path,
			});
		}
	}

	private async reviewsDir(
		cwd: string,
		signal: AbortSignal | undefined,
	): Promise<RoasterResult<string>> {
		const repoRoot = await this.gitGateway.repoRoot({ cwd, signal });
		if (!repoRoot.ok)
			return error({ type: "reviews_dir_missing", message: repoRoot.error.message });
		return { type: "ok", value: join(repoRoot.value, REVIEWS_DIRNAME) };
	}
}

export interface FakeReviewCatalogGatewayOptions {
	readonly reviewSourcesByKey?:
		| Readonly<Record<string, string>>
		| ReadonlyMap<string, string>
		| undefined;
	readonly reviewSourceFailuresByKey?:
		| Readonly<Record<string, ReviewCatalogFailure>>
		| ReadonlyMap<string, ReviewCatalogFailure>
		| undefined;
	readonly reviewKeys?: readonly string[] | undefined;
	readonly listReviewKeysFailure?: ReviewCatalogFailure | undefined;
	readonly reviewsDir?: string | undefined;
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
		this.reviewsDirValue = options.reviewsDir ?? "/repo/reviews";
	}

	async listReviewKeys(_options: {
		readonly cwd: string;
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewCatalog>> {
		if (this.listReviewKeysFailure !== null) return error({ ...this.listReviewKeysFailure });
		const keys =
			this.reviewKeys === null ? [...this.reviewSourcesByKey.keys()].sort() : [...this.reviewKeys];
		return { type: "ok", value: { reviewsDir: this.reviewsDirValue, keys } };
	}

	async loadReviewSource(options: {
		readonly cwd: string;
		readonly key: string;
		readonly signal?: AbortSignal | undefined;
	}): Promise<RoasterResult<ReviewSource>> {
		this.requestedReviewKeysInternal.push(options.key);
		const configuredFailure = this.reviewSourceFailuresByKey.get(options.key);
		if (configuredFailure !== undefined) return error({ ...configuredFailure });
		const source = this.reviewSourcesByKey.get(options.key);
		if (source === undefined) {
			const path = join(this.reviewsDirValue, `${options.key}.md`);
			return error({
				type: "review_definition_not_found",
				message: `No fake review definition configured for key ${JSON.stringify(options.key)} at ${path}.`,
				reviewKey: options.key,
				path,
			});
		}
		return {
			type: "ok",
			value: { key: options.key, path: join(this.reviewsDirValue, `${options.key}.md`), source },
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
): Promise<RoasterResult<ResolvedReviewPath>> {
	const normalized = key.trim();
	if (normalized === "")
		return error({
			type: "review_key_invalid",
			message: "Review key must not be empty.",
			reviewKey: key,
		});
	if (normalized.startsWith("/") || normalized.split(/[\\/]/u).includes("..")) {
		return error({
			type: "review_key_invalid",
			message: `Review key must be a relative path without \`..\`: ${JSON.stringify(key)}`,
			reviewKey: key,
		});
	}

	const status = await directoryStatus(reviewsDir);
	if (status === "missing")
		return error({
			type: "reviews_dir_missing",
			message: `No reviews directory at ${reviewsDir}. Create it and add \`<key>.md\` files.`,
		});
	if (status !== "directory")
		return error({
			type: "reviews_dir_not_directory",
			message: `Reviews path is not a directory: ${reviewsDir}`,
		});

	const path = join(reviewsDir, `${normalized}.md`);
	const rel = relative(reviewsDir, path);
	if (rel.startsWith("..") || rel === "" || rel.startsWith(sep)) {
		return error({
			type: "review_key_invalid",
			message: `Review key ${JSON.stringify(key)} resolves outside ${reviewsDir}.`,
			reviewKey: key,
		});
	}
	return { type: "ok", value: { key: normalized, path } };
}

async function markdownFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const paths: string[] = [];
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) paths.push(...(await markdownFiles(path)));
		else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
	}
	return paths;
}

function keyFromPath(root: string, path: string): string {
	const withoutSuffix = relative(root, path).replace(/\.md$/u, "");
	return withoutSuffix.split(sep).join("/");
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

function error(errorValue: ReviewCatalogFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
}

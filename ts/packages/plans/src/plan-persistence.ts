import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { CommandExecApi } from "@asdl/core/exec";
import { RealPlansGitGateway, type PlansGitGateway } from "./git-gateway.ts";

const GENERIC_SLUG_WORDS = new Set([
	"plan",
	"task",
	"tasks",
	"work",
	"implementation",
	"implement",
	"changes",
	"change",
	"update",
	"updates",
]);

export function validatePlanSlug(slug: string): string | undefined {
	const normalized = slug.trim();
	if (normalized.length === 0) {
		return "Slug is required.";
	}

	if (normalized.toLowerCase().endsWith(".md")) {
		return "Pass the slug without the .md suffix.";
	}

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
		return "Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
	}

	if (/^(?:19|20)\d{2}-\d{1,2}-\d{1,2}$/.test(normalized)) {
		return "Slug must not be a date.";
	}

	const tokens = normalized.split("-");
	if (tokens.length < 3) {
		return "Slug must contain at least 3 words.";
	}
	if (tokens.length > 7) {
		return "Slug must contain at most 7 words.";
	}

	if (tokens.some((token) => /^(?:19|20)\d{2}$/.test(token))) {
		return "Slug must not contain date-like year tokens.";
	}

	if (tokens.every((token) => GENERIC_SLUG_WORDS.has(token))) {
		return "Slug must include at least one specific, non-generic word.";
	}

	return undefined;
}

export function normalizePlanFilePath(rawPath: string): string {
	const trimmed = rawPath.trim();
	const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
	if (withoutAt === "~") {
		return homedir();
	}
	if (withoutAt.startsWith("~/")) {
		return join(homedir(), withoutAt.slice(2));
	}
	return withoutAt;
}

export function isPathInside(parent: string, child: string): boolean {
	const relativePath = relative(resolve(parent), resolve(child));
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export interface ResolvePlanSourceFileOptions {
	cwd: string;
	rawFilePath: string;
	signal?: AbortSignal | undefined;
	git?: PlansGitGateway | undefined;
}

export interface ResolveGitRepoRootOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: PlansGitGateway | undefined;
}

export async function resolvePlanSourceFile(pi: CommandExecApi, options: ResolvePlanSourceFileOptions): Promise<string> {
	const git = options.git ?? new RealPlansGitGateway(pi);
	const normalizedPath = normalizePlanFilePath(options.rawFilePath);
	if (!isAbsolute(normalizedPath)) {
		throw new Error(`Plan file path must be absolute or home-relative; got ${displayNonEmpty(normalizedPath)}.`);
	}

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(normalizedPath);
	} catch {
		throw new Error(`Plan file does not exist or is not accessible: ${normalizedPath}`);
	}
	if (!fileStat.isFile()) {
		throw new Error(`Plan file must be a regular file: ${normalizedPath}`);
	}

	const realFilePath = await realpathIfPossible(normalizedPath);
	const repoRoot = await resolveGitRepoRoot(pi, { cwd: options.cwd, signal: options.signal, git });
	if (repoRoot !== undefined) {
		const realRepoRoot = await realpathIfPossible(repoRoot);
		if (isPathInside(realRepoRoot, realFilePath)) {
			throw new Error(`Plan file must be outside the repository; got ${realFilePath} inside ${realRepoRoot}.`);
		}
	}

	return realFilePath;
}

export async function resolveGitRepoRoot(pi: CommandExecApi, options: ResolveGitRepoRootOptions): Promise<string | undefined> {
	const git = options.git ?? new RealPlansGitGateway(pi);
	const root = await git.optionalRepoRoot({ cwd: options.cwd, signal: options.signal });
	return root.type === "found" ? resolve(root.value) : undefined;
}

export function normalizeSummary(summary: string | undefined): string | undefined {
	if (summary === undefined) {
		return undefined;
	}
	const trimmed = summary.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function displayNonEmpty(value: string): string {
	return value.length > 0 ? value : "(empty)";
}

async function realpathIfPossible(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}


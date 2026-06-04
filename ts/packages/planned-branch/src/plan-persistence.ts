import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
	formatBrmemUnavailableMessage,
	runFirstAvailableBrmemCommand,
	type UnavailableBrmemRun,
} from "./brmem-cli.ts";
import { formatOutputSection, tailText, type ExecResult } from "./command-runtime.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";

const BRMEM_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;

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

export interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface PlanCommandExecApi {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

interface CompletedBrmemRunForPlan {
	type: "completed";
	result: ExecResult;
	displayCommand: string;
}

interface BrmemUnavailableRun {
	type: "unavailable";
	message: string;
	failures: readonly UnavailableBrmemRun[];
}

export type BrmemRun = CompletedBrmemRunForPlan | BrmemUnavailableRun;

export interface BrmemPutData {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
}

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
	git?: PlannedBranchGitGateway | undefined;
}

export interface ResolveGitRepoRootOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: PlannedBranchGitGateway | undefined;
}

export async function resolvePlanSourceFile(pi: PlanCommandExecApi, options: ResolvePlanSourceFileOptions): Promise<string> {
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const normalizedPath = normalizePlanFilePath(options.rawFilePath);
	if (!isAbsolute(normalizedPath)) {
		throw new Error(`Plan file path must be absolute or home-relative; got ${normalizedPath || "(empty)"}.`);
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

export async function resolveGitRepoRoot(pi: PlanCommandExecApi, options: ResolveGitRepoRootOptions): Promise<string | undefined> {
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const root = await git.optionalRepoRoot({ cwd: options.cwd, signal: options.signal });
	return root.type === "found" ? resolve(root.value) : undefined;
}

export interface RunBrmemOptions {
	cwd: string;
	args: string[];
	signal?: AbortSignal | undefined;
}

export async function runBrmem(pi: PlanCommandExecApi, options: RunBrmemOptions): Promise<BrmemRun> {
	const run = await runFirstAvailableBrmemCommand({
		gateway: pi,
		cwd: options.cwd,
		brmemArgs: options.args,
		timeoutMs: BRMEM_TIMEOUT_MS,
		signal: options.signal,
	});
	if (run.type === "unavailable") {
		return {
			type: "unavailable",
			message: formatBrmemUnavailableMessage(run.failures),
			failures: run.failures,
		};
	}
	return { type: "completed", result: run.result, displayCommand: run.displayCommand };
}

export function parseBrmemPutData(stdout: string): BrmemPutData {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem put JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

	const namespace = data.namespace;
	const key = data.key;
	const branch = data.branch;
	const refName = data.ref_name;
	const commit = data.commit;
	const sourceFile = data.source_file;
	if (
		typeof namespace !== "string" ||
		typeof key !== "string" ||
		typeof branch !== "string" ||
		typeof refName !== "string" ||
		typeof commit !== "string" ||
		typeof sourceFile !== "string"
	) {
		throw malformedBrmemPutData(
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.ref_name, data.commit, and data.source_file",
		);
	}

	return { namespace, key, branch, refName, commit, sourceFile };
}

export function normalizeSummary(summary: string | undefined): string | undefined {
	if (summary === undefined) {
		return undefined;
	}
	const trimmed = summary.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function formatCommandFailure(title: string, displayCommand: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

function malformedBrmemPutData(stdout: string, reason: string): Error {
	return new Error(`Malformed brmem put JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

async function realpathIfPossible(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}


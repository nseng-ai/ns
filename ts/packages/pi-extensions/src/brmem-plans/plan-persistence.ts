import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { formatCommand, formatOutputSection, tailText, type ExecResult } from "../command-runtime.ts";

const BRMEM_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
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

export type ExecOptions = {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
};

export type BrmemPlanExecApi = {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
};

export type BrmemCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

export type BrmemRun = {
	result: ExecResult;
	displayCommand: string;
};

export type BrmemPutData = {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
};

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
	return withoutAt;
}

export function isPathInside(parent: string, child: string): boolean {
	const relativePath = relative(resolve(parent), resolve(child));
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export async function resolvePlanSourceFile(
	pi: BrmemPlanExecApi,
	cwd: string,
	rawFilePath: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const normalizedPath = normalizePlanFilePath(rawFilePath);
	if (!isAbsolute(normalizedPath)) {
		throw new Error(`Plan file path must be absolute; got ${normalizedPath || "(empty)"}.`);
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
	const repoRoot = await resolveGitRepoRoot(pi, cwd, signal);
	if (repoRoot !== undefined) {
		const realRepoRoot = await realpathIfPossible(repoRoot);
		if (isPathInside(realRepoRoot, realFilePath)) {
			throw new Error(`Plan file must be outside the repository; got ${realFilePath} inside ${realRepoRoot}.`);
		}
	}

	return realFilePath;
}

export async function resolveGitRepoRoot(
	pi: BrmemPlanExecApi,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	let result: ExecResult;
	try {
		result = await pi.exec("git", ["rev-parse", "--show-toplevel"], execOptions(cwd, GIT_TIMEOUT_MS, signal));
	} catch {
		return undefined;
	}

	if (result.code !== 0 || result.killed) {
		return undefined;
	}

	const root = firstNonEmptyLine(result.stdout);
	return root ? resolve(root) : undefined;
}

export async function runBrmem(
	pi: BrmemPlanExecApi,
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
): Promise<BrmemRun> {
	const failures: string[] = [];
	for (const candidate of resolveBrmemCommandCandidates(cwd)) {
		const commandArgs = [...candidate.prefixArgs, ...args];
		const displayCommand = formatCommand(candidate.command, commandArgs);
		try {
			const result = await pi.exec(candidate.command, commandArgs, execOptions(cwd, BRMEM_TIMEOUT_MS, signal));
			if (isLikelyCommandNotFound(result)) {
				failures.push(formatCommandFailure("brmem command candidate was unavailable", displayCommand, result));
				continue;
			}
			return { result, displayCommand };
		} catch (error) {
			failures.push(formatStartupFailure(displayCommand, error));
		}
	}

	throw new Error(
		[
			"No brmem command available. Tried all configured brmem command candidates.",
			...failures.map((failure) => `\n${failure}`),
		].join("\n"),
	);
}

export function resolveBrmemCommandCandidates(cwd: string): BrmemCommandCandidate[] {
	const candidates: BrmemCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: BrmemCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", "brmem"));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "brmem"), prefixArgs: [] });
	}

	add({ command: "brmem", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "brmem"] });
	}

	return candidates;
}

export function parseBrmemPutData(stdout: string): BrmemPutData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Malformed brmem put JSON: ${message}\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
	}

	if (!isRecord(parsed)) {
		throw malformedBrmemPutEnvelope(stdout, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode === "number" && envelopeExitCode !== 0) {
		throw malformedBrmemPutEnvelope(stdout, `expected envelope exit_code 0, got ${envelopeExitCode}`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw malformedBrmemPutEnvelope(stdout, "expected a data object");
	}

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
		throw malformedBrmemPutEnvelope(
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

function findAncestorContaining(startDir: string, relativePath: string): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function malformedBrmemPutEnvelope(stdout: string, reason: string): Error {
	return new Error(`Malformed brmem put JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function formatStartupFailure(displayCommand: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return tailText(`brmem command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`, {
		maxChars: MAX_ERROR_CHARS,
		maxLines: 80,
	});
}

function isLikelyCommandNotFound(result: ExecResult): boolean {
	if (result.code !== 127 || result.killed) {
		return false;
	}

	const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
	return output.includes("command not found") || output.includes("not found") || output.includes("no such file");
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

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

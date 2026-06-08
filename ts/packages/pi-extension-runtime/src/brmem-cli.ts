import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
	formatCommand,
	formatOutputSection,
	normalizeExecResult,
	tailText,
	type ExecResult,
	type PiExecResultLike,
} from "./command-runtime.ts";

const MAX_ERROR_CHARS = 4_000;

export interface BrmemExecGateway {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<PiExecResultLike>;
}

export interface BrmemCommandCandidate {
	command: string;
	prefixArgs: string[];
}

export interface CompletedBrmemRun {
	type: "completed";
	candidate: BrmemCommandCandidate;
	command: string;
	args: string[];
	displayCommand: string;
	result: ExecResult;
}

export interface UnavailableBrmemRun {
	type: "unavailable";
	candidate: BrmemCommandCandidate;
	command: string;
	args: string[];
	displayCommand: string;
	failure: string;
}

export type BrmemCandidateRun = CompletedBrmemRun | UnavailableBrmemRun;

export interface NoAvailableBrmemCommandRun {
	type: "unavailable";
	failures: readonly UnavailableBrmemRun[];
}

export type FirstAvailableBrmemCommandRun = CompletedBrmemRun | NoAvailableBrmemCommandRun;

export interface RunBrmemCandidateOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	candidate: BrmemCommandCandidate;
	brmemArgs: readonly string[];
	timeoutMs: number;
	signal?: AbortSignal | undefined;
}

export interface RunFirstAvailableBrmemCommandOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	brmemArgs: readonly string[];
	timeoutMs: number;
	signal?: AbortSignal | undefined;
}

export function resolveBrmemCommandCandidates(
	cwd: string,
	options: { exists?: (path: string) => boolean } = {},
): BrmemCommandCandidate[] {
	const exists = options.exists ?? existsSync;
	const startDir = resolve(cwd);
	const candidates: BrmemCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: BrmemCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(startDir, join(".venv", "bin", "brmem"), exists);
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "brmem"), prefixArgs: [] });
	}

	add({ command: "brmem", prefixArgs: [] });

	const projectRoot = findAncestorContaining(startDir, "pyproject.toml", exists);
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "brmem"] });
	}

	return candidates;
}

export async function runBrmemCandidate(options: RunBrmemCandidateOptions): Promise<BrmemCandidateRun> {
	const { gateway, cwd, candidate, brmemArgs, timeoutMs, signal } = options;
	const args = [...candidate.prefixArgs, ...brmemArgs];
	const displayCommand = formatCommand(candidate.command, args);

	try {
		const result = normalizeExecResult(
			await gateway.exec(candidate.command, args, execOptions(cwd, timeoutMs, signal)),
		);
		if (isLikelyCommandNotFound(result)) {
			return {
				type: "unavailable",
				candidate,
				command: candidate.command,
				args,
				displayCommand,
				failure: formatCommandFailure("brmem command candidate was unavailable", displayCommand, result),
			};
		}

		return {
			type: "completed",
			candidate,
			command: candidate.command,
			args,
			displayCommand,
			result,
		};
	} catch (error) {
		return {
			type: "unavailable",
			candidate,
			command: candidate.command,
			args,
			displayCommand,
			failure: formatStartupFailure(displayCommand, error),
		};
	}
}

export async function runFirstAvailableBrmemCommand(
	options: RunFirstAvailableBrmemCommandOptions,
): Promise<FirstAvailableBrmemCommandRun> {
	const { gateway, cwd, brmemArgs, timeoutMs, signal } = options;
	const failures: UnavailableBrmemRun[] = [];
	for (const candidate of resolveBrmemCommandCandidates(cwd)) {
		const run = await runBrmemCandidate({ gateway, cwd, candidate, brmemArgs, timeoutMs, signal });
		if (run.type === "completed") return run;
		failures.push(run);
	}

	return { type: "unavailable", failures };
}

export function formatBrmemUnavailableMessage(failures: readonly UnavailableBrmemRun[]): string {
	return [
		"No brmem command available. Tried all configured brmem command candidates.",
		...failures.map((failure) => `\n${failure.failure}`),
	].join("\n");
}

export function formatBrmemUnavailableError(failures: readonly UnavailableBrmemRun[]): Error {
	return new Error(formatBrmemUnavailableMessage(failures));
}

function findAncestorContaining(
	startDir: string,
	relativePath: string,
	exists: (path: string) => boolean,
): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (exists(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined) {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function formatCommandFailure(title: string, displayCommand: string, result: ExecResult): string {
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

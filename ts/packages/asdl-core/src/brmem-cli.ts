import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
	MAX_ERROR_CHARS,
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	normalizeExecResult,
	tailText,
	type ExecResult,
	type PiExecResultLike,
} from "./exec.ts";
import { formatErrorMessage, isRecord } from "./primitives.ts";

export const DEFAULT_BRMEM_TIMEOUT_MS = 30_000;

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

export interface BrmemCommandErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BrmemCommandResult<T> = { ok: true; value: T } | { ok: false; error: BrmemCommandErrorInfo };

export interface RunAvailableBrmemCommandOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	brmemArgs: readonly string[];
	timeoutMs?: number;
	signal?: AbortSignal | undefined;
}

export interface BrmemPutData {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
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
		const result = normalizeExecResult(await gateway.exec(candidate.command, args, execOptions(cwd, timeoutMs, signal)));
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

export async function runAvailableBrmemCommand(
	options: RunAvailableBrmemCommandOptions,
): Promise<BrmemCommandResult<CompletedBrmemRun>> {
	const run = await runFirstAvailableBrmemCommand({
		gateway: options.gateway,
		cwd: options.cwd,
		brmemArgs: options.brmemArgs,
		timeoutMs: options.timeoutMs ?? DEFAULT_BRMEM_TIMEOUT_MS,
		signal: options.signal,
	});
	if (run.type === "unavailable") {
		return { ok: false, error: { code: "brmem_unavailable", message: formatBrmemUnavailableMessage(run.failures) } };
	}
	return { ok: true, value: run };
}

export function brmemCommandFailure(code: string, title: string, run: CompletedBrmemRun): BrmemCommandErrorInfo {
	return { code, message: formatCommandFailure(title, run.displayCommand, run.result), displayCommand: run.displayCommand };
}

export function parseBrmemPutData(stdout: string): BrmemPutData {
	const data = parseMachineEnvelopeData(stdout, "brmem put JSON");
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
		throw malformedBrmemEnvelope(
			"brmem put",
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.ref_name, data.commit, and data.source_file",
		);
	}

	return { namespace, key, branch, refName, commit, sourceFile };
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

function parseMachineEnvelopeData(stdout: string, label: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		throw malformedMachineEnvelope(stdout, label, `invalid JSON: ${formatErrorMessage(error)}`);
	}

	if (!isRecord(parsed)) {
		throw malformedMachineEnvelope(stdout, label, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode !== "number" || !Number.isFinite(envelopeExitCode)) {
		throw malformedMachineEnvelope(stdout, label, "expected numeric exit_code 0");
	}

	if (envelopeExitCode !== 0) {
		const statusText = envelopeStatusText(parsed);
		const suffix = statusText === undefined ? "" : `: ${statusText}`;
		throw malformedMachineEnvelope(stdout, label, `expected envelope exit_code 0, got exit_code ${envelopeExitCode}${suffix}`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw malformedMachineEnvelope(stdout, label, "expected a data object");
	}

	return data;
}

function malformedMachineEnvelope(stdout: string, label: string, reason: string): Error {
	return new Error(`Malformed ${label}: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

function malformedBrmemEnvelope(commandName: string, stdout: string, reason: string): Error {
	return new Error(`Malformed ${commandName} JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

function envelopeStatusText(envelope: Record<string, unknown>): string | undefined {
	if (typeof envelope.message === "string" && envelope.message.length > 0) {
		return envelope.message;
	}
	if (typeof envelope.error === "string" && envelope.error.length > 0) {
		return envelope.error;
	}
	return undefined;
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

function formatStartupFailure(displayCommand: string, error: unknown): string {
	return formatCommandStartupFailure("brmem command", displayCommand, error);
}

function isLikelyCommandNotFound(result: ExecResult): boolean {
	if (result.startupError !== undefined) {
		return true;
	}
	if (result.code !== 127 || result.killed) {
		return false;
	}

	const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
	return output.includes("command not found") || output.includes("not found") || output.includes("no such file");
}

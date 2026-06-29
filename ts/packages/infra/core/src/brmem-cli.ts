import { existsSync } from "node:fs";

import {
	MAX_ERROR_CHARS,
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	normalizeExecResult,
	tailText,
	type ExecResult,
	type PiExecResultLike,
} from "./command.ts";
import { formatErrorMessage, isRecord } from "./primitives.ts";
import { findWorkspaceRootByMarkers } from "./workspace-root.ts";

export const DEFAULT_BRMEM_TIMEOUT_MS = 30_000;

export interface BrmemExecGateway {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; signal?: AbortSignal },
	): Promise<PiExecResultLike>;
}

interface BrmemCommandCandidate {
	command: string;
	prefixArgs: string[];
}

export interface CompletedBrmemRun {
	type: "completed";
	command: string;
	args: string[];
	displayCommand: string;
	result: ExecResult;
}

export interface UnavailableBrmemRun {
	type: "unavailable";
	command: string;
	args: string[];
	displayCommand: string;
	failure: string;
}

type BrmemCandidateRun = CompletedBrmemRun | UnavailableBrmemRun;

export type RunBrmemResult =
	| CompletedBrmemRun
	| { type: "unavailable"; failures: readonly UnavailableBrmemRun[] };

interface RunBrmemOnCandidateOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	candidate: BrmemCommandCandidate;
	brmemArgs: readonly string[];
	timeoutMs: number;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
}

export interface RunBrmemOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	brmemArgs: readonly string[];
	timeoutMs: number;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
}

export interface BrmemCommandErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BrmemCommandResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: BrmemCommandErrorInfo };

export interface RunAvailableBrmemCommandOptions {
	gateway: BrmemExecGateway;
	cwd: string;
	brmemArgs: readonly string[];
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv | undefined;
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

export interface BrmemListEntry {
	readonly namespace: string;
	readonly key: string;
	readonly branch: string;
	readonly refName: string;
}

interface BrmemCheckData {
	present: boolean;
}

export interface BrmemEntryLocator {
	namespace: string;
	key: string;
	branch: string;
}

export interface CheckBrmemEntryOptions extends BrmemEntryLocator {
	gateway: BrmemExecGateway;
	cwd: string;
	timeoutMs?: number;
	signal?: AbortSignal | undefined;
}

export type BrmemEntryPresenceResult =
	| { type: "present"; displayCommand: string }
	| { type: "absent" }
	| { type: "error"; error: BrmemCommandErrorInfo };

export interface PutBrmemEntryFromFileOptions {
	readonly gateway: BrmemExecGateway;
	readonly cwd: string;
	readonly namespace: string;
	readonly key: string;
	readonly branch?: string | undefined;
	readonly sourceFile: string;
	readonly timeoutMs?: number;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface ListBrmemEntriesOptions {
	readonly gateway: BrmemExecGateway;
	readonly cwd: string;
	readonly namespace?: string | undefined;
	readonly branch?: string | undefined;
	readonly timeoutMs?: number | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

function brmemCommandCandidates(
	cwd: string,
	options: { exists?: (path: string) => boolean } = {},
): BrmemCommandCandidate[] {
	const exists = options.exists ?? existsSync;
	const tsWorkspaceRoot = findWorkspaceRootByMarkers({
		cwd,
		markers: ["pnpm-workspace.yaml", "packages/infra/brmem/package.json"],
		nestedDirectory: "ts",
		exists,
	});
	if (tsWorkspaceRoot === null) return [{ command: "brmem", prefixArgs: [] }];
	return [
		{ command: "brmem", prefixArgs: [] },
		{
			command: "pnpm",
			prefixArgs: [
				"--config.verify-deps-before-run=false",
				"--dir",
				tsWorkspaceRoot,
				"exec",
				"brmem",
			],
		},
	];
}

async function runBrmemOnCandidate(
	options: RunBrmemOnCandidateOptions,
): Promise<BrmemCandidateRun> {
	const { gateway, cwd, candidate, brmemArgs, timeoutMs, env, signal } = options;
	const args = [...candidate.prefixArgs, ...brmemArgs];
	const displayCommand = formatCommand(candidate.command, args);

	try {
		const result = normalizeExecResult(
			await gateway.exec(candidate.command, args, execOptions(cwd, timeoutMs, env, signal)),
		);
		if (isLikelyCommandNotFound(result)) {
			return {
				type: "unavailable",
				command: candidate.command,
				args,
				displayCommand,
				failure: formatCommandFailure(
					"brmem command candidate was unavailable",
					displayCommand,
					result,
				),
			};
		}

		return {
			type: "completed",
			command: candidate.command,
			args,
			displayCommand,
			result,
		};
	} catch (error) {
		return {
			type: "unavailable",
			command: candidate.command,
			args,
			displayCommand,
			failure: formatStartupFailure(displayCommand, error),
		};
	}
}

export async function runBrmem(options: RunBrmemOptions): Promise<RunBrmemResult> {
	const { gateway, cwd, brmemArgs, timeoutMs, env, signal } = options;
	const failures: UnavailableBrmemRun[] = [];
	for (const candidate of brmemCommandCandidates(cwd)) {
		const run = await runBrmemOnCandidate({
			gateway,
			cwd,
			candidate,
			brmemArgs,
			timeoutMs,
			...(env === undefined ? {} : { env }),
			signal,
		});
		if (run.type === "completed") return run;
		failures.push(run);
	}

	return { type: "unavailable", failures };
}

export async function runAvailableBrmemCommand(
	options: RunAvailableBrmemCommandOptions,
): Promise<BrmemCommandResult<CompletedBrmemRun>> {
	const run = await runBrmem({
		gateway: options.gateway,
		cwd: options.cwd,
		brmemArgs: options.brmemArgs,
		timeoutMs: options.timeoutMs ?? DEFAULT_BRMEM_TIMEOUT_MS,
		...(options.env === undefined ? {} : { env: options.env }),
		signal: options.signal,
	});
	if (run.type === "unavailable") {
		return {
			ok: false,
			error: { code: "brmem_unavailable", message: formatBrmemUnavailableMessage(run.failures) },
		};
	}
	return { ok: true, value: run };
}

export async function checkBrmemEntry(
	options: CheckBrmemEntryOptions,
): Promise<BrmemEntryPresenceResult> {
	const run = await runAvailableBrmemCommand({
		gateway: options.gateway,
		cwd: options.cwd,
		brmemArgs: [
			"check",
			options.key,
			"--namespace",
			options.namespace,
			"--branch",
			options.branch,
			"--format",
			"json",
		],
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		signal: options.signal,
	});
	if (!run.ok) return { type: "error", error: run.error };
	if (run.value.result.killed) {
		return {
			type: "error",
			error: brmemCommandFailure(
				"brmem_check_killed",
				"brmem check timed out or was killed",
				run.value,
			),
		};
	}
	if (run.value.result.code === 0) {
		try {
			const data = parseBrmemCheckData(run.value.result.stdout);
			if (!data.present) return { type: "absent" };
			return { type: "present", displayCommand: run.value.displayCommand };
		} catch (error) {
			return {
				type: "error",
				error: {
					code: "brmem_malformed_check",
					message: formatErrorMessage(error),
					displayCommand: run.value.displayCommand,
				},
			};
		}
	}
	return {
		type: "error",
		error: brmemCommandFailure("brmem_check_failed", "brmem check failed", run.value),
	};
}

export async function putBrmemEntryFromFile(
	options: PutBrmemEntryFromFileOptions,
): Promise<BrmemCommandResult<BrmemPutData>> {
	const run = await runAvailableBrmemCommand({
		gateway: options.gateway,
		cwd: options.cwd,
		brmemArgs: [
			"put",
			options.key,
			"--namespace",
			options.namespace,
			...(options.branch === undefined ? [] : ["--branch", options.branch]),
			"--file",
			options.sourceFile,
			"--format",
			"json",
		],
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.env === undefined ? {} : { env: options.env }),
		signal: options.signal,
	});
	if (!run.ok) return run;
	if (run.value.result.code !== 0 || run.value.result.killed) {
		return {
			ok: false,
			error: brmemCommandFailure("brmem_put_failed", "brmem put failed", run.value),
		};
	}

	try {
		const data = parseBrmemPutData(run.value.result.stdout);
		const mismatches = expectedMismatches(
			{
				namespace: data.namespace,
				key: data.key,
				branch: data.branch,
				sourceFile: data.sourceFile,
			},
			{
				namespace: options.namespace,
				key: options.key,
				branch: options.branch,
				sourceFile: options.sourceFile,
			},
		);
		if (mismatches.length > 0) {
			return {
				ok: false,
				error: {
					code: "brmem_unexpected_put_data",
					message: `Unexpected brmem put JSON data: ${mismatches.join(", ")}.`,
					displayCommand: run.value.displayCommand,
				},
			};
		}
		return { ok: true, value: data };
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "brmem_malformed_put",
				message: formatErrorMessage(error),
				displayCommand: run.value.displayCommand,
			},
		};
	}
}

export async function listBrmemEntries(
	options: ListBrmemEntriesOptions,
): Promise<BrmemCommandResult<readonly BrmemListEntry[]>> {
	const run = await runAvailableBrmemCommand({
		gateway: options.gateway,
		cwd: options.cwd,
		brmemArgs: [
			"list",
			...(options.namespace === undefined ? [] : ["--namespace", options.namespace]),
			...(options.branch === undefined ? [] : ["--branch", options.branch]),
			"--format",
			"json",
		],
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.env === undefined ? {} : { env: options.env }),
		signal: options.signal,
	});
	if (!run.ok) return run;
	if (run.value.result.code !== 0 || run.value.result.killed) {
		return {
			ok: false,
			error: brmemCommandFailure("brmem_list_failed", "brmem list failed", run.value),
		};
	}

	try {
		return {
			ok: true,
			value: parseBrmemListEntries(run.value.result.stdout, {
				namespace: options.namespace,
				branch: options.branch,
			}),
		};
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "brmem_malformed_list",
				message: formatErrorMessage(error),
				displayCommand: run.value.displayCommand,
			},
		};
	}
}

export function brmemCommandFailure(
	code: string,
	title: string,
	run: CompletedBrmemRun,
): BrmemCommandErrorInfo {
	const message = brmemEnvelopeFailureMessage(title, run);
	return {
		code,
		message,
		displayCommand: run.displayCommand,
	};
}

function parseBrmemCheckData(stdout: string): BrmemCheckData {
	const data = parseBrmemMachineEnvelopeData(stdout, "brmem check JSON");
	const present = data.present;
	if (typeof present !== "boolean") {
		throw malformedBrmemEnvelope("brmem check", stdout, "expected boolean field data.present");
	}
	return { present };
}

export function parseBrmemPutData(stdout: string): BrmemPutData {
	const data = parseBrmemMachineEnvelopeData(stdout, "brmem put JSON");
	const fields = requireBrmemStringFields(
		data,
		["namespace", "key", "branch", "refName", "commit", "sourceFile"],
		{
			commandName: "brmem put",
			stdout,
		},
	);

	return {
		namespace: fields.namespace,
		key: fields.key,
		branch: fields.branch,
		refName: fields.refName,
		commit: fields.commit,
		sourceFile: fields.sourceFile,
	};
}

export function parseBrmemListEntries(
	stdout: string,
	expected: { readonly namespace?: string | undefined; readonly branch?: string | undefined } = {},
): readonly BrmemListEntry[] {
	const data = parseBrmemMachineEnvelopeData(stdout, "brmem list JSON");
	const entries = data.entries;
	if (!Array.isArray(entries)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected data.entries array");
	}

	return entries.map((entry, index) =>
		parseBrmemListEntry({ value: entry, index, stdout, expected }),
	);
}

export function formatBrmemUnavailableMessage(failures: readonly UnavailableBrmemRun[]): string {
	return [
		"No brmem command available. Install the TypeScript-backed public shim with `just install-brmem` or `just install-tools`, then ensure `brmem` is on PATH.",
		...failures.map((failure) => `\n${failure.failure}`),
	].join("\n");
}

export function formatBrmemUnavailableError(failures: readonly UnavailableBrmemRun[]): Error {
	return new Error(formatBrmemUnavailableMessage(failures));
}

export interface BrmemFieldParseContext {
	commandName: string;
	stdout: string;
	pathPrefix?: string;
}

export function requireBrmemStringFields<const Field extends string>(
	data: Record<string, unknown>,
	fields: readonly Field[],
	context: BrmemFieldParseContext,
): Record<Field, string> {
	const values = {} as Record<Field, string>;
	const invalidFields: string[] = [];
	for (const field of fields) {
		const value = data[field];
		if (typeof value !== "string") {
			invalidFields.push(fieldPath(context, field));
			continue;
		}
		values[field] = value;
	}

	if (invalidFields.length > 0) {
		throw malformedBrmemEnvelope(
			context.commandName,
			context.stdout,
			`expected string fields ${formatFieldList(invalidFields)}`,
		);
	}

	return values;
}

export function parseBrmemMachineEnvelopeData(
	stdout: string,
	label: string,
): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		throw malformedMachineEnvelope(stdout, label, `invalid JSON: ${formatErrorMessage(error)}`);
	}

	if (!isRecord(parsed)) {
		throw malformedMachineEnvelope(stdout, label, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exitCode;
	if (typeof envelopeExitCode !== "number" || !Number.isFinite(envelopeExitCode)) {
		throw malformedMachineEnvelope(stdout, label, "expected numeric exitCode 0");
	}

	if (envelopeExitCode !== 0) {
		const statusText = envelopeStatusText(parsed);
		const suffix = statusText === undefined ? "" : `: ${statusText}`;
		throw malformedMachineEnvelope(
			stdout,
			label,
			`expected envelope exitCode 0, got exitCode ${envelopeExitCode}${suffix}`,
		);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw malformedMachineEnvelope(stdout, label, "expected a data object");
	}

	return data;
}

function fieldPath(context: BrmemFieldParseContext, field: string): string {
	return `${context.pathPrefix ?? "data"}.${field}`;
}

function formatFieldList(fields: readonly string[]): string {
	if (fields.length <= 1) return fields[0] ?? "";
	return `${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]}`;
}

function malformedMachineEnvelope(stdout: string, label: string, reason: string): Error {
	return new Error(
		`Malformed ${label}: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`,
	);
}

function malformedBrmemEnvelope(commandName: string, stdout: string, reason: string): Error {
	return new Error(
		`Malformed ${commandName} JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`,
	);
}

interface ParseBrmemListEntryOptions {
	readonly value: unknown;
	readonly index: number;
	readonly stdout: string;
	readonly expected: {
		readonly namespace?: string | undefined;
		readonly branch?: string | undefined;
	};
}

function parseBrmemListEntry(options: ParseBrmemListEntryOptions): BrmemListEntry {
	const { value, index, stdout, expected } = options;
	if (!isRecord(value)) {
		throw malformedBrmemEnvelope("brmem list", stdout, `expected data.entries[${index}] object`);
	}

	const fields = requireBrmemStringFields(value, ["namespace", "key", "branch", "refName"], {
		commandName: "brmem list",
		stdout,
		pathPrefix: `data.entries[${index}]`,
	});
	const mismatches = expectedMismatches(
		{ namespace: fields.namespace, branch: fields.branch },
		expected,
	);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope(
			"brmem list",
			stdout,
			`expected canonical entry at data.entries[${index}] (${mismatches.join(", ")})`,
		);
	}

	return {
		namespace: fields.namespace,
		key: fields.key,
		branch: fields.branch,
		refName: fields.refName,
	};
}

function expectedMismatches(
	actual: Record<string, string>,
	expected: Record<string, string | undefined>,
): string[] {
	const mismatches: string[] = [];
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (expectedValue === undefined) continue;
		if (actual[field] !== expectedValue) {
			mismatches.push(
				`${field} ${JSON.stringify(actual[field])} != ${JSON.stringify(expectedValue)}`,
			);
		}
	}
	return mismatches;
}

function brmemEnvelopeFailureMessage(title: string, run: CompletedBrmemRun): string {
	const statusText = parseEnvelopeStatusText(run.result.stdout);
	const fallback = formatCommandFailure(title, run.displayCommand, run.result);
	if (statusText === undefined) return fallback;
	return `${title}: ${statusText}\n\n${fallback}`;
}

function parseEnvelopeStatusText(stdout: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	return envelopeStatusText(parsed);
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

function execOptions(
	cwd: string,
	timeout: number,
	env: NodeJS.ProcessEnv | undefined,
	signal: AbortSignal | undefined,
) {
	return {
		cwd,
		timeout,
		...(env === undefined ? {} : { env }),
		...(signal === undefined ? {} : { signal }),
	};
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
	return (
		output.includes("command not found") ||
		output.includes("not found") ||
		output.includes("no such file")
	);
}

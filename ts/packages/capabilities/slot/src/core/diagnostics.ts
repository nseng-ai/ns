import { appendFile } from "node:fs/promises";
import { optionalEntry } from "@ji/core/primitives";

import {
	type CommandExecApi,
	type CommandRunner,
	type ExecOptions,
	type ExecResult,
	formatCommand,
} from "@ji/core/command";

export const SLOT_DIAGNOSTIC_LOG_ENV = "NS_SLOT_DIAGNOSTIC_LOG";

export interface SlotCommandDiagnosticEvent {
	readonly type: "slot.command";
	readonly operation: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly displayCommand: string;
	readonly cwd?: string;
	readonly timeoutMs?: number;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly exitCode: number;
	readonly killed: boolean;
	readonly stdoutBytes: number;
	readonly stderrBytes: number;
	readonly startupError?: string;
}

export interface SlotDiagnosticSink {
	recordCommand(event: SlotCommandDiagnosticEvent): Promise<void> | void;
}

export interface RunDiagnosticCommandOptions {
	readonly execApi: CommandExecApi;
	readonly command: string;
	readonly args: readonly string[];
	readonly execOptions: ExecOptions;
	readonly operation: string;
	readonly diagnosticSink?: SlotDiagnosticSink;
}

export interface DiagnosticCommandRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly operation: string;
	readonly diagnosticSink?: SlotDiagnosticSink;
}

class JsonlSlotDiagnosticSink implements SlotDiagnosticSink {
	private readonly path: string;

	constructor(path: string) {
		this.path = path;
	}

	async recordCommand(event: SlotCommandDiagnosticEvent): Promise<void> {
		await appendFile(this.path, `${JSON.stringify(event)}\n`, "utf8");
	}
}

export function createSlotDiagnosticSinkFromEnv(
	env: NodeJS.ProcessEnv,
): SlotDiagnosticSink | undefined {
	const path = env[SLOT_DIAGNOSTIC_LOG_ENV]?.trim();
	if (path === undefined || path.length === 0) return undefined;
	return new JsonlSlotDiagnosticSink(path);
}

export function createDiagnosticCommandRunner(
	options: DiagnosticCommandRunnerOptions,
): CommandRunner {
	return async (command, args, execOptions) =>
		await runDiagnosticCommand({
			execApi: options.execApi,
			command,
			args,
			execOptions: execOptions ?? {},
			operation: options.operation,
			...optionalEntry("diagnosticSink", options.diagnosticSink),
		});
}

export async function runDiagnosticCommand(
	options: RunDiagnosticCommandOptions,
): Promise<ExecResult> {
	const startedAt = new Date();
	const startedNs = process.hrtime.bigint();
	const result = await options.execApi.exec(
		options.command,
		[...options.args],
		options.execOptions,
	);
	const finishedNs = process.hrtime.bigint();
	await options.diagnosticSink?.recordCommand({
		type: "slot.command",
		operation: options.operation,
		command: options.command,
		args: [...options.args],
		displayCommand: formatCommand(options.command, options.args),
		...optionalEntry("cwd", options.execOptions.cwd),
		...(options.execOptions.timeout === undefined
			? {}
			: { timeoutMs: options.execOptions.timeout }),
		startedAt: startedAt.toISOString(),
		durationMs: Number(finishedNs - startedNs) / 1_000_000,
		exitCode: result.code,
		killed: result.killed,
		stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
		stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
		...optionalEntry("startupError", result.startupError),
	});
	return result;
}

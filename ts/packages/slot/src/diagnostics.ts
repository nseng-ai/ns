import { appendFile } from "node:fs/promises";

import { formatCommand, type CommandExecApi, type ExecOptions, type ExecResult } from "@asdl/core/exec";

export const SLOT_DIAGNOSTIC_LOG_ENV = "ASDL_SLOT_DIAGNOSTIC_LOG";

export interface SlotCommandDiagnosticEvent {
	readonly type: "slot.command";
	readonly operation: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly displayCommand: string;
	readonly cwd?: string | undefined;
	readonly timeoutMs?: number | undefined;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly exitCode: number;
	readonly killed: boolean;
	readonly stdoutBytes: number;
	readonly stderrBytes: number;
	readonly startupError?: string | undefined;
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
	readonly diagnosticSink?: SlotDiagnosticSink | undefined;
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

export function createSlotDiagnosticSinkFromEnv(env: NodeJS.ProcessEnv): SlotDiagnosticSink | undefined {
	const path = env[SLOT_DIAGNOSTIC_LOG_ENV]?.trim();
	if (path === undefined || path.length === 0) return undefined;
	return new JsonlSlotDiagnosticSink(path);
}

export async function runDiagnosticCommand(options: RunDiagnosticCommandOptions): Promise<ExecResult> {
	const startedAt = new Date();
	const startedNs = process.hrtime.bigint();
	const result = await options.execApi.exec(options.command, [...options.args], options.execOptions);
	const finishedNs = process.hrtime.bigint();
	await options.diagnosticSink?.recordCommand({
		type: "slot.command",
		operation: options.operation,
		command: options.command,
		args: [...options.args],
		displayCommand: formatCommand(options.command, options.args),
		...(options.execOptions.cwd === undefined ? {} : { cwd: options.execOptions.cwd }),
		...(options.execOptions.timeout === undefined ? {} : { timeoutMs: options.execOptions.timeout }),
		startedAt: startedAt.toISOString(),
		durationMs: Number(finishedNs - startedNs) / 1_000_000,
		exitCode: result.code,
		killed: result.killed,
		stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
		stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	});
	return result;
}

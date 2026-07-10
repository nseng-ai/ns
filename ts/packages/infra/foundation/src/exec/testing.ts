import type {
	CommandExecApi,
	CommandRunner,
	ExecOptions,
	ExecResult,
} from "@nseng-ai/foundation/command";
import {
	formatErrorMessage,
	optionalEntries,
	optionalEntry,
} from "@nseng-ai/foundation/primitives";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";

export interface DropExecOptionsFields {
	readonly shouldDropEnv?: boolean;
	readonly shouldDropStdin?: boolean;
}

export interface DroppingOptionsCommandExecApiOptions extends DropExecOptionsFields {
	readonly delegate: CommandExecApi;
}

export interface CommandCallFields {
	readonly command: string;
	readonly args: readonly string[];
}

export interface RunnerCall extends CommandCallFields {
	readonly cwd?: string;
}

export type ScriptStep = CommandCallFields & { readonly result: ExecResult };

export interface ScriptedCommandExecCall extends CommandCallFields {
	readonly options?: ExecOptions;
}

export class ScriptedCommandRunner {
	private readonly callsInternal: RunnerCall[] = [];
	private readonly script: ScriptedQueue<ScriptStep>;

	constructor(script: readonly ScriptStep[]) {
		this.script = new ScriptedQueue(script, copyScriptStep);
	}

	get calls(): readonly RunnerCall[] {
		return this.callsInternal.map(copyRunnerCall);
	}

	readonly runner: CommandRunner = async (command, args, options = {}) => {
		this.callsInternal.push({
			command,
			args: [...args],
			...optionalEntry("cwd", options.cwd),
		});
		const missingStepMessage = `unexpected command: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return exitedResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return exitedResult({ code: 99, stderr: message });
		}

		const commandResult = expected.result;
		if (commandResult.stdout !== "") options.onStdout?.(commandResult.stdout);
		if (commandResult.stderr !== "") options.onStderr?.(commandResult.stderr);
		return commandResult;
	};

	assertDone(): void {
		this.script.assertDone();
	}
}

export class ScriptedCommandExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	private readonly callsInternal: ScriptedCommandExecCall[] = [];

	constructor(results: readonly ExecResult[] = []) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({
			command,
			args: [...args],
			...optionalEntry("options", options === undefined ? undefined : { ...options }),
		});
		return this.results.shift() ?? exitedResult();
	}

	calls(): readonly ScriptedCommandExecCall[] {
		return this.callsInternal.map(copyScriptedCommandExecCall);
	}
}

export class DroppingOptionsCommandExecApi implements CommandExecApi {
	// Some tests deliberately brand this wrapper as stdin-capable while dropping
	// stdin to prove downstream runtime guards fail safe when adapters lie.
	readonly supportsStdin = true as const;
	private readonly delegate: CommandExecApi;
	private readonly dropFields: DropExecOptionsFields;

	constructor(options: DroppingOptionsCommandExecApiOptions) {
		this.delegate = options.delegate;
		this.dropFields = {
			...optionalEntry("shouldDropEnv", options.shouldDropEnv),
			...optionalEntry("shouldDropStdin", options.shouldDropStdin),
		};
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		return await this.delegate.exec(
			command,
			args,
			copyExecOptionsWithout(options, this.dropFields),
		);
	}
}

export function copyExecOptionsWithout(
	options: ExecOptions | undefined,
	dropFields: DropExecOptionsFields,
): ExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...optionalEntries({
			cwd: options.cwd,
			env: dropFields.shouldDropEnv === true ? undefined : options.env,
			timeout: options.timeout,
		}),
		...optionalEntry("terminationKillGraceMs", options.terminationKillGraceMs),
		...optionalEntry("signal", options.signal),
		...optionalEntry("stdin", dropFields.shouldDropStdin === true ? undefined : options.stdin),
		...optionalEntries({ onStdout: options.onStdout, onStderr: options.onStderr }),
	};
}

export function step(
	command: string,
	args: readonly string[],
	result = exitedResult(),
): ScriptStep {
	return { command, args: [...args], result };
}

export interface CloseResultFields {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number | null;
	readonly signal?: string | null;
}

export function exitedResult(fields: CloseResultFields = {}): ExecResult {
	return closeResult("exited", fields, 0);
}

export function cancelledResult(fields: CloseResultFields = {}): ExecResult {
	return closeResult("cancelled", fields, null);
}

export function timedOutResult(fields: CloseResultFields = {}): ExecResult {
	return closeResult("timed-out", fields, null);
}

export function spawnFailedResult(error: unknown, stdout = ""): ExecResult {
	const message = formatErrorMessage(error);
	return { type: "spawn-failed", stdout, stderr: message, error: message };
}

function closeResult(
	type: "exited" | "cancelled" | "timed-out",
	fields: CloseResultFields,
	defaultCode: number | null,
): ExecResult {
	return {
		type,
		stdout: fields.stdout ?? "",
		stderr: fields.stderr ?? "",
		code: fields.code === undefined ? defaultCode : fields.code,
		signal: fields.signal === undefined ? null : fields.signal,
	};
}

function copyRunnerCall(call: RunnerCall): RunnerCall {
	return {
		...copyCommandCallFields(call),
		...optionalEntry("cwd", call.cwd),
	};
}

function copyScriptedCommandExecCall(call: ScriptedCommandExecCall): ScriptedCommandExecCall {
	return {
		...copyCommandCallFields(call),
		...optionalEntry("options", call.options === undefined ? undefined : { ...call.options }),
	};
}

function copyCommandCallFields(call: CommandCallFields): CommandCallFields {
	return { command: call.command, args: [...call.args] };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function copyScriptStep(stepValue: ScriptStep): ScriptStep {
	return { ...stepValue, args: [...stepValue.args] };
}

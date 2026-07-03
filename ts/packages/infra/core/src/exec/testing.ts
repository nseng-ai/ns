import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "@ns/core/command";
import { optionalEntries, optionalEntry } from "@ns/core/primitives";
import { ScriptedQueue } from "@ns/core/test-kit";

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

export interface ResultFields {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly startupError?: string;
	readonly isKilled?: boolean;
}

export type StepOptions = ResultFields;

export type ScriptStep = CommandCallFields & ResultFields;

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
			return result({ exitCode: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return result({ exitCode: 99, stderr: message });
		}

		const commandResult = result(expected);
		if (commandResult.stdout !== "") {
			options.onStdout?.(commandResult.stdout);
		}
		if (commandResult.stderr !== "") {
			options.onStderr?.(commandResult.stderr);
		}
		return commandResult;
	};

	assertDone(): void {
		this.script.assertDone();
	}
}

export class ScriptedCommandExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	private readonly callsInternal: ScriptedCommandExecCall[] = [];

	constructor(results: readonly Partial<ExecResult>[] = []) {
		this.results = results.map((fields) => ({
			stdout: "",
			stderr: "",
			code: 0,
			killed: false,
			...fields,
		}));
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({
			command,
			args: [...args],
			...optionalEntry("options", options === undefined ? undefined : { ...options }),
		});
		return this.results.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
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
		...optionalEntry("timeoutKillGraceMs", options.timeoutKillGraceMs),
		...optionalEntry("signal", options.signal),
		...optionalEntry("stdin", dropFields.shouldDropStdin === true ? undefined : options.stdin),
		...optionalEntries({ onStdout: options.onStdout, onStderr: options.onStderr }),
	};
}

export function step(
	command: string,
	args: readonly string[],
	options: StepOptions = {},
): ScriptStep {
	return { command, args: [...args], ...options };
}

export function startupErrorStep(
	command: string,
	args: readonly string[],
	startupError: string,
): ScriptStep {
	return { command, args: [...args], exitCode: 127, startupError };
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

function result(fields: ResultFields): ExecResult {
	return {
		code: fields.exitCode ?? 0,
		stdout: fields.stdout ?? "",
		stderr: fields.startupError ?? fields.stderr ?? "",
		killed: fields.isKilled === true,
		...optionalEntry("startupError", fields.startupError),
	};
}

function copyScriptStep(stepValue: ScriptStep): ScriptStep {
	return { ...stepValue, args: [...stepValue.args] };
}

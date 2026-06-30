import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "@sdl/core/command";
import { optionalEntry } from "@sdl/core/primitives";
import { ScriptedQueue } from "@sdl/test-kit";

export interface DropExecOptionsFields {
	readonly shouldDropEnv?: boolean;
	readonly shouldDropStdin?: boolean;
}

export interface DroppingOptionsCommandExecApiOptions extends DropExecOptionsFields {
	readonly delegate: CommandExecApi;
}

export interface RunnerCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string | undefined;
}

export interface ResultFields {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly startupError?: string;
	readonly isKilled?: boolean;
}

export type StepOptions = ResultFields;

export interface ScriptStep extends ResultFields {
	readonly command: string;
	readonly args: readonly string[];
}

export interface ScriptedCommandExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options?: ExecOptions | undefined;
}

export class ScriptedCommandRunner {
	private readonly callsInternal: RunnerCall[] = [];
	private readonly script: ScriptedQueue<ScriptStep>;

	constructor(script: readonly ScriptStep[]) {
		this.script = new ScriptedQueue(script, copyScriptStep);
	}

	get calls(): readonly RunnerCall[] {
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			...optionalEntry("cwd", call.cwd),
		}));
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
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			...optionalEntry("options", call.options === undefined ? undefined : { ...call.options }),
		}));
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
			...(options.shouldDropStdin === undefined
				? {}
				: { shouldDropStdin: options.shouldDropStdin }),
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
		...optionalEntry("cwd", options.cwd),
		...optionalEntry("env", dropFields.shouldDropEnv === true ? undefined : options.env),
		...optionalEntry("timeout", options.timeout),
		...(options.timeoutKillGraceMs === undefined
			? {}
			: { timeoutKillGraceMs: options.timeoutKillGraceMs }),
		...optionalEntry("signal", options.signal),
		...(dropFields.shouldDropStdin === true || options.stdin === undefined
			? {}
			: { stdin: options.stdin }),
		...optionalEntry("onStdout", options.onStdout),
		...optionalEntry("onStderr", options.onStderr),
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

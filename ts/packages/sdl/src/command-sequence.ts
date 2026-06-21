import type { SdlCommandResult, SdlContext } from "./sdk.ts";

export interface SdlCommandStepOptions {
	timeoutMs?: number;
	stdin?: string;
}

export interface SdlStdoutStepOptions extends SdlCommandStepOptions {
	transformStdout?: (stdout: string) => string;
}

export interface SdlCommandSequenceStepBase<TError> {
	command: string;
	args: readonly string[];
	timeoutMs?: number;
	stdin?: string;
	failure(result: SdlCommandResult): TError;
}

export interface SdlRunCommandStep<TError> extends SdlCommandSequenceStepBase<TError> {
	type: "run";
}

export interface SdlStdoutCommandStep<
	TKey extends string,
	TError,
> extends SdlCommandSequenceStepBase<TError> {
	type: "stdout";
	outputKey: TKey;
	transformStdout?: (stdout: string) => string;
}

export type SdlCommandSequenceStep<TKey extends string, TError> =
	| SdlRunCommandStep<TError>
	| SdlStdoutCommandStep<TKey, TError>;

export type SdlCommandSequenceOutputs<
	TSteps extends readonly SdlCommandSequenceStep<string, unknown>[],
> = {
	[TStep in Extract<TSteps[number], { type: "stdout" }> as TStep["outputKey"]]: string;
};

export type SdlCommandSequenceResult<
	TSteps extends readonly SdlCommandSequenceStep<string, unknown>[],
	TError,
> = { ok: true; outputs: SdlCommandSequenceOutputs<TSteps> } | { ok: false; error: TError };

export interface SdlCommandStepBuilder {
	run<TError>(
		args: readonly string[],
		failure: (result: SdlCommandResult) => TError,
		options?: SdlCommandStepOptions,
	): SdlRunCommandStep<TError>;
	stdout<const TKey extends string, TError>(
		outputKey: TKey,
		args: readonly string[],
		failure: (result: SdlCommandResult) => TError,
		options?: SdlStdoutStepOptions,
	): SdlStdoutCommandStep<TKey, TError>;
	trimmedStdout<const TKey extends string, TError>(
		outputKey: TKey,
		args: readonly string[],
		failure: (result: SdlCommandResult) => TError,
		options?: SdlCommandStepOptions,
	): SdlStdoutCommandStep<TKey, TError>;
}

export async function runSdlCommandSequence<
	const TSteps extends readonly SdlCommandSequenceStep<string, TError>[],
	TError,
>(ctx: SdlContext, steps: TSteps): Promise<SdlCommandSequenceResult<TSteps, TError>> {
	const outputs: Record<string, string> = {};
	for (const step of steps) {
		const result = await ctx.exec(step.command, [...step.args], {
			...(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs }),
			...(step.stdin === undefined ? {} : { stdin: step.stdin }),
		});
		if (!result.succeeded()) {
			return { ok: false, error: step.failure(result) };
		}
		if (step.type === "stdout") {
			outputs[step.outputKey] = step.transformStdout?.(result.stdout) ?? result.stdout;
		}
	}
	return { ok: true, outputs: outputs as SdlCommandSequenceOutputs<TSteps> };
}

export function commandSteps(
	command: string,
	defaultOptions: SdlCommandStepOptions = {},
): SdlCommandStepBuilder {
	return {
		run: (args, failure, options = {}) =>
			commandStep(command, args, failure, mergeCommandStepOptions(defaultOptions, options)),
		stdout: (outputKey, args, failure, options = {}) =>
			stdoutCommandStep(
				command,
				outputKey,
				args,
				failure,
				mergeCommandStepOptions(defaultOptions, options),
			),
		trimmedStdout: (outputKey, args, failure, options = {}) =>
			stdoutCommandStep(command, outputKey, args, failure, {
				...mergeCommandStepOptions(defaultOptions, options),
				transformStdout: trimStdout,
			}),
	};
}

export function commandStep<TError>(
	command: string,
	args: readonly string[],
	failure: (result: SdlCommandResult) => TError,
	options: SdlCommandStepOptions = {},
): SdlRunCommandStep<TError> {
	return {
		type: "run",
		command,
		args,
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		failure,
	};
}

export function stdoutCommandStep<const TKey extends string, TError>(
	command: string,
	outputKey: TKey,
	args: readonly string[],
	failure: (result: SdlCommandResult) => TError,
	options: SdlStdoutStepOptions = {},
): SdlStdoutCommandStep<TKey, TError> {
	return {
		type: "stdout",
		outputKey,
		command,
		args,
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		failure,
		...(options.transformStdout === undefined ? {} : { transformStdout: options.transformStdout }),
	};
}

export function commandEvidenceFailure(intro: string): (result: SdlCommandResult) => string {
	return (result) => result.formatEvidence(intro);
}

export function trimStdout(stdout: string): string {
	return stdout.trim();
}

function mergeCommandStepOptions<TOptions extends SdlCommandStepOptions>(
	defaults: SdlCommandStepOptions,
	overrides: TOptions,
): TOptions {
	return {
		...defaults,
		...overrides,
	};
}

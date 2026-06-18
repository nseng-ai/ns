import { formatCommand, formatOutputSection } from "@asdl/core/exec";
import {
	DEFAULT_FAST_MODEL,
	DEFAULT_FAST_MODEL_REF,
	resolveModelRef,
	type ParsedModelRef,
} from "./model-defaults.ts";

export const SLUG_MODEL_ENV = "ASDL_SLUG_MODEL";
export const SLUG_MODEL_THINKING = "minimal";
export const SLUG_MODEL_TIMEOUT_MS = 60_000;

const MAX_ERROR_CHARS = 4_000;
const SLUG_MODEL_MAX_ATTEMPTS = 2;

export interface SlugModelExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface SlugModelCommandResult {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
}

export interface SlugModelEvidence {
	slug: string;
	rawOutput: string;
	provider: string;
	model: string;
}

export interface SlugModelFailure {
	lines: string[];
}

export type SlugModelDerivationResult =
	| { ok: true; evidence: SlugModelEvidence }
	| { ok: false; failure: SlugModelFailure };

type SlugModelAttemptOutcome =
	| { type: "terminal"; result: SlugModelDerivationResult }
	| { type: "retry" };

export interface DeriveSlugWithModelInput {
	cwd: string;
	prompt: string;
	slugKind: string;
	env?: Record<string, string | undefined>;
	normalizeOutput(output: string): string | undefined;
	exec(
		command: string,
		args: string[],
		options: SlugModelExecOptions,
	): Promise<SlugModelCommandResult>;
	signal?: AbortSignal;
}

export async function deriveSlugWithModel(
	input: DeriveSlugWithModelInput,
): Promise<SlugModelDerivationResult> {
	const resolution = resolveModelRef(
		input.env ?? process.env,
		SLUG_MODEL_ENV,
		DEFAULT_FAST_MODEL_REF,
	);
	if (!resolution.ok) {
		return { ok: false, failure: { lines: [resolution.error] } };
	}
	const model = resolution.value;
	const args = buildSlugModelArgs(input.prompt, model);
	const displayCommand = formatCommand("pi", [...args.slice(0, -1), "<slug-prompt>"]);

	let hasRetriedKilledResult = false;
	let attempt = 1;
	while (true) {
		const outcome = await runSlugModelAttempt({
			input,
			model,
			args,
			displayCommand,
			attempt,
			hasRetriedKilledResult,
		});

		if (outcome.type === "terminal") {
			return outcome.result;
		}

		hasRetriedKilledResult = true;
		attempt += 1;
	}
}

interface RunSlugModelAttemptInput {
	input: DeriveSlugWithModelInput;
	model: ParsedModelRef;
	args: string[];
	displayCommand: string;
	attempt: number;
	hasRetriedKilledResult: boolean;
}

async function runSlugModelAttempt(
	options: RunSlugModelAttemptInput,
): Promise<SlugModelAttemptOutcome> {
	let result: SlugModelCommandResult;
	try {
		result = await options.input.exec(
			"pi",
			options.args,
			execOptions(options.input.cwd, options.input.signal),
		);
	} catch (error) {
		return {
			type: "terminal",
			result: {
				ok: false,
				failure: {
					lines: [
						"Pi slug model command failed before completion.",
						`Command: ${options.displayCommand}`,
						`Error: ${error instanceof Error ? error.message : String(error)}`,
					],
				},
			},
		};
	}

	if (shouldRetryKilledSlugModelResult(result, options.input.signal, options.attempt)) {
		return { type: "retry" };
	}

	if (result.code !== 0 || result.killed) {
		const status = result.killed
			? `exit code ${result.code}; process was killed or timed out`
			: `exit code ${result.code}`;
		return {
			type: "terminal",
			result: {
				ok: false,
				failure: {
					lines: [
						`Pi slug model command failed (${status}).`,
						...(options.hasRetriedKilledResult
							? ["Retried once after a killed/timeout result."]
							: []),
						`Command: ${options.displayCommand}`,
						formatOutputSection("stdout", result.stdout ?? "", {
							maxChars: MAX_ERROR_CHARS,
							maxLines: 80,
						}),
						formatOutputSection("stderr", result.stderr ?? "", {
							maxChars: MAX_ERROR_CHARS,
							maxLines: 80,
						}),
					],
				},
			},
		};
	}

	const rawOutput = result.stdout ?? "";
	if (rawOutput.trim().length === 0) {
		return {
			type: "terminal",
			result: { ok: false, failure: { lines: ["Pi slug model returned empty output."] } },
		};
	}

	const slug = options.input.normalizeOutput(rawOutput);
	if (slug === undefined) {
		return {
			type: "terminal",
			result: {
				ok: false,
				failure: {
					lines: [
						`Pi slug model output could not be normalized into a ${options.input.slugKind}.`,
						formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
					],
				},
			},
		};
	}

	return {
		type: "terminal",
		result: {
			ok: true,
			evidence: {
				slug,
				rawOutput,
				provider: options.model.provider,
				model: options.model.modelId,
			},
		},
	};
}

export function buildSlugModelArgs(
	prompt: string,
	model: ParsedModelRef = DEFAULT_FAST_MODEL,
): string[] {
	return [
		"--provider",
		model.provider,
		"--model",
		model.modelId,
		"--thinking",
		SLUG_MODEL_THINKING,
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-tools",
		"--mode",
		"text",
		"--print",
		prompt,
	];
}

export function formatSlugModelFailure(failure: SlugModelFailure): string {
	return failure.lines.join("\n");
}

function execOptions(cwd: string, signal: AbortSignal | undefined): SlugModelExecOptions {
	const options: SlugModelExecOptions = { cwd, timeout: SLUG_MODEL_TIMEOUT_MS };
	if (signal !== undefined) {
		options.signal = signal;
	}
	return options;
}

function shouldRetryKilledSlugModelResult(
	result: SlugModelCommandResult,
	signal: AbortSignal | undefined,
	attempt: number,
): boolean {
	return result.killed === true && signal?.aborted !== true && attempt < SLUG_MODEL_MAX_ATTEMPTS;
}

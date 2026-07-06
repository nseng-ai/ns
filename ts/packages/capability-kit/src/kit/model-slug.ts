import { formatCommand, formatOutputSection } from "@nseng-ai/foundation/command";
import {
	DEFAULT_FAST_MODEL,
	DEFAULT_FAST_MODEL_REF,
	resolveModelRef,
	SLUG_MODEL_ENV,
	type ParsedModelRef,
} from "@nseng-ai/foundation/model-slug";

export const RAW_TEXT_MODEL_THINKING = "minimal";
export const RAW_TEXT_MODEL_TIMEOUT_MS = 60_000;

const MAX_ERROR_CHARS = 4_000;
const RAW_TEXT_MODEL_MAX_ATTEMPTS = 2;

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

export interface RawTextModelEvidence {
	rawOutput: string;
	provider: string;
	model: string;
}

export interface SlugModelEvidence extends RawTextModelEvidence {
	slug: string;
}

export interface SlugModelFailure {
	lines: string[];
}

export type RawTextModelGenerationResult =
	| { ok: true; evidence: RawTextModelEvidence }
	| { ok: false; failure: SlugModelFailure };

export type SlugModelDerivationResult =
	| { ok: true; evidence: SlugModelEvidence }
	| { ok: false; failure: SlugModelFailure };

type RawTextModelAttemptOutcome =
	| { type: "terminal"; result: RawTextModelGenerationResult }
	| { type: "retry" };

export interface GenerateRawTextWithModelInput {
	cwd: string;
	prompt: string;
	env?: Record<string, string | undefined>;
	exec(
		command: string,
		args: string[],
		options: SlugModelExecOptions,
	): Promise<SlugModelCommandResult>;
	signal?: AbortSignal;
}

export interface DeriveSlugWithModelInput extends GenerateRawTextWithModelInput {
	slugKind: string;
	normalizeOutput(output: string): string | undefined;
}

export async function deriveSlugWithModel(
	input: DeriveSlugWithModelInput,
): Promise<SlugModelDerivationResult> {
	const rawTextResult = await generateRawTextWithModel(input);
	if (!rawTextResult.ok) {
		return rawTextResult;
	}

	const slug = input.normalizeOutput(rawTextResult.evidence.rawOutput);
	if (slug === undefined) {
		return {
			ok: false,
			failure: {
				lines: [
					`Pi slug model output could not be normalized into a ${input.slugKind}.`,
					formatOutputSection("stdout", rawTextResult.evidence.rawOutput, {
						maxChars: MAX_ERROR_CHARS,
						maxLines: 80,
					}),
				],
			},
		};
	}

	return { ok: true, evidence: { ...rawTextResult.evidence, slug } };
}

export async function generateRawTextWithModel(
	input: GenerateRawTextWithModelInput,
): Promise<RawTextModelGenerationResult> {
	const resolution = resolveModelRef(
		input.env ?? process.env,
		SLUG_MODEL_ENV,
		DEFAULT_FAST_MODEL_REF,
	);
	if (!resolution.ok) {
		return { ok: false, failure: { lines: [resolution.error] } };
	}
	const model = resolution.value;
	const args = buildRawTextModelArgs(input.prompt, model);
	const displayCommand = formatCommand("pi", [...args.slice(0, -1), "<model-prompt>"]);

	let hasRetriedKilledResult = false;
	let attempt = 1;
	while (true) {
		const outcome = await runRawTextModelAttempt({
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

interface RunRawTextModelAttemptInput {
	input: GenerateRawTextWithModelInput;
	model: ParsedModelRef;
	args: string[];
	displayCommand: string;
	attempt: number;
	hasRetriedKilledResult: boolean;
}

async function runRawTextModelAttempt(
	options: RunRawTextModelAttemptInput,
): Promise<RawTextModelAttemptOutcome> {
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
						"Pi model command failed before completion.",
						`Command: ${options.displayCommand}`,
						`Error: ${error instanceof Error ? error.message : String(error)}`,
					],
				},
			},
		};
	}

	if (shouldRetryKilledRawTextModelResult(result, options.input.signal, options.attempt)) {
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
						`Pi model command failed (${status}).`,
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
			result: { ok: false, failure: { lines: ["Pi model returned empty output."] } },
		};
	}

	return {
		type: "terminal",
		result: {
			ok: true,
			evidence: {
				rawOutput,
				provider: options.model.provider,
				model: options.model.modelId,
			},
		},
	};
}

export function buildRawTextModelArgs(
	prompt: string,
	model: ParsedModelRef = DEFAULT_FAST_MODEL,
): string[] {
	return [
		"--provider",
		model.provider,
		"--model",
		model.modelId,
		"--thinking",
		RAW_TEXT_MODEL_THINKING,
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
	const options: SlugModelExecOptions = { cwd, timeout: RAW_TEXT_MODEL_TIMEOUT_MS };
	if (signal !== undefined) {
		options.signal = signal;
	}
	return options;
}

// This is a bounded immediate retry for killed subprocess results; no TimerScheduler is needed
// because there is no delay or backoff between attempts.
function shouldRetryKilledRawTextModelResult(
	result: SlugModelCommandResult,
	signal: AbortSignal | undefined,
	attempt: number,
): boolean {
	return (
		result.killed === true && signal?.aborted !== true && attempt < RAW_TEXT_MODEL_MAX_ATTEMPTS
	);
}

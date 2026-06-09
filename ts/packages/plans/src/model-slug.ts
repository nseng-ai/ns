import { formatCommand, formatOutputSection } from "./command-runtime.ts";
import {
	DEFAULT_FAST_MODEL,
	DEFAULT_FAST_MODEL_REF,
	resolveModelRef,
	type ModelRefResolution,
	type ParsedModelRef,
} from "./model-defaults.ts";

export const SLUG_MODEL_ENV = "ASDL_SLUG_MODEL";
export const SLUG_MODEL_THINKING = "minimal";
export const SLUG_MODEL_TIMEOUT_MS = 60_000;

export const DEFAULT_SLUG_MODEL: ParsedModelRef = DEFAULT_FAST_MODEL;

const MAX_ERROR_CHARS = 4_000;

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

export interface DeriveSlugWithModelInput {
	cwd: string;
	prompt: string;
	slugKind: string;
	model?: ParsedModelRef;
	normalizeOutput(output: string): string | undefined;
	exec(command: string, args: string[], options: SlugModelExecOptions): Promise<SlugModelCommandResult>;
	signal?: AbortSignal;
}

export function resolveSlugModel(env: Record<string, string | undefined>): ModelRefResolution {
	return resolveModelRef(env, SLUG_MODEL_ENV, DEFAULT_FAST_MODEL_REF);
}

export async function deriveSlugWithModel(input: DeriveSlugWithModelInput): Promise<SlugModelDerivationResult> {
	const model = input.model ?? DEFAULT_SLUG_MODEL;
	const args = buildSlugModelArgs(input.prompt, model);
	const displayCommand = formatCommand("pi", [...args.slice(0, -1), "<slug-prompt>"]);

	let result: SlugModelCommandResult;
	try {
		result = await input.exec("pi", args, execOptions(input.cwd, input.signal));
	} catch (error) {
		return {
			ok: false,
			failure: {
				lines: [
					"Pi slug model command failed before completion.",
					`Command: ${displayCommand}`,
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				],
			},
		};
	}

	if (result.code !== 0 || result.killed) {
		const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
		return {
			ok: false,
			failure: {
				lines: [
					`Pi slug model command failed (${status}).`,
					`Command: ${displayCommand}`,
					formatOutputSection("stdout", result.stdout ?? "", { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
					formatOutputSection("stderr", result.stderr ?? "", { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
				],
			},
		};
	}

	const rawOutput = result.stdout ?? "";
	if (rawOutput.trim().length === 0) {
		return { ok: false, failure: { lines: ["Pi slug model returned empty output."] } };
	}

	const slug = input.normalizeOutput(rawOutput);
	if (slug === undefined) {
		return {
			ok: false,
			failure: {
				lines: [
					`Pi slug model output could not be normalized into a ${input.slugKind}.`,
					formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
				],
			},
		};
	}

	return {
		ok: true,
		evidence: {
			slug,
			rawOutput,
			provider: model.provider,
			model: model.modelId,
		},
	};
}

export function buildSlugModelArgs(prompt: string, model: ParsedModelRef = DEFAULT_SLUG_MODEL): string[] {
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

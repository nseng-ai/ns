import { formatCommand, formatOutputSection } from "./exec.ts";

export interface ParsedModelRef {
	provider: string;
	modelId: string;
}

export const DEFAULT_FAST_MODEL: ParsedModelRef = {
	provider: "openai-codex",
	modelId: "gpt-5.4-mini",
};
export const DEFAULT_FAST_MODEL_REF = `${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`;

export type ModelRefResolution = { ok: true; value: ParsedModelRef } | { ok: false; error: string };

export type ModelProviderFamily = "anthropic" | "google" | "openai";

export interface ModelProviderFamilyInfo {
	readonly label: string;
	readonly exampleProvider: string;
	readonly article: "a" | "an";
}

export const MODEL_PROVIDER_FAMILY_INFO: Record<ModelProviderFamily, ModelProviderFamilyInfo> = {
	anthropic: { label: "Anthropic", exampleProvider: "anthropic", article: "an" },
	google: { label: "Google", exampleProvider: "google", article: "a" },
	openai: { label: "OpenAI", exampleProvider: "openai-codex", article: "an" },
};

const MODEL_PROVIDER_FAMILY_PROVIDERS: Record<ModelProviderFamily, readonly string[]> = {
	anthropic: ["anthropic"],
	google: ["google", "gemini"],
	openai: ["openai", "openai-codex"],
};
const MODEL_PROVIDER_FAMILIES = [
	"anthropic",
	"google",
	"openai",
] as const satisfies readonly ModelProviderFamily[];

const ANTHROPIC_MODEL_SHORTHANDS = ["sonnet", "opus", "haiku", "fable"] as const;
const CLAUDE_CODE_MODEL_SHORTHANDS = ["sonnet", "opus", "haiku"] as const;

export const SLUG_MODEL_ENV = "SDL_SLUG_MODEL";
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

export function parseModelRef(modelRef: string): ParsedModelRef | undefined {
	const separator = modelRef.indexOf("/");
	if (separator <= 0 || separator === modelRef.length - 1) {
		return undefined;
	}
	return {
		provider: modelRef.slice(0, separator),
		modelId: modelRef.slice(separator + 1),
	};
}

export function modelIdFromModelPattern(modelPattern: string): string {
	return baseModelIdFromModelPattern(modelPattern).toLowerCase();
}

export function inferModelProviderFamily(
	modelPatternOrRef: string,
): ModelProviderFamily | undefined {
	const trimmed = modelPatternOrRef.trim();
	if (trimmed === "") return undefined;

	const parsedRef = parseModelRef(trimmed);
	if (parsedRef !== undefined) {
		return inferProviderFamily(parsedRef.provider) ?? inferModelIdProviderFamily(parsedRef.modelId);
	}

	return inferModelIdProviderFamily(trimmed);
}

export function providerMatchesModelProviderFamily(
	provider: string,
	family: ModelProviderFamily,
): boolean {
	return MODEL_PROVIDER_FAMILY_PROVIDERS[family].includes(provider.toLowerCase());
}

export function isClaudeCodeSupportedModelPattern(modelPattern: string): boolean {
	const modelId = baseModelIdFromModelPattern(modelPattern);
	return isClaudeCodeShorthand(modelId) || modelId.startsWith("claude-");
}

function baseModelIdFromModelPattern(modelPattern: string): string {
	return modelPattern.trim().split(":", 1)[0] ?? "";
}

function inferProviderFamily(provider: string): ModelProviderFamily | undefined {
	const normalizedProvider = provider.toLowerCase();
	for (const family of MODEL_PROVIDER_FAMILIES) {
		if (MODEL_PROVIDER_FAMILY_PROVIDERS[family].includes(normalizedProvider)) return family;
	}
	return undefined;
}

function inferModelIdProviderFamily(modelIdPattern: string): ModelProviderFamily | undefined {
	const modelId = modelIdFromModelPattern(modelIdPattern);
	if (isAnthropicModelShorthand(modelId) || modelId.startsWith("claude-")) return "anthropic";
	if (modelId.startsWith("gemini-")) return "google";
	if (modelId.startsWith("gpt-") || /^o[134](?:-|$)/u.test(modelId)) return "openai";
	return undefined;
}

function isAnthropicModelShorthand(modelId: string): boolean {
	return ANTHROPIC_MODEL_SHORTHANDS.some((shorthand) => shorthand === modelId);
}

function isClaudeCodeShorthand(modelId: string): boolean {
	return CLAUDE_CODE_MODEL_SHORTHANDS.some((shorthand) => shorthand === modelId);
}

export function resolveModelRef(
	env: Record<string, string | undefined>,
	envVar: string,
	defaultRef: string,
): ModelRefResolution {
	const modelRef = env[envVar]?.trim() || defaultRef;
	const parsed = parseModelRef(modelRef);
	if (parsed === undefined) {
		return {
			ok: false,
			error: `Invalid ${envVar}=${JSON.stringify(modelRef)}. Expected "provider/modelId".`,
		};
	}
	return { ok: true, value: parsed };
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

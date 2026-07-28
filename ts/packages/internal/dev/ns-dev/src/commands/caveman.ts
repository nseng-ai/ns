import { dirname, join } from "node:path";

import { failure, ok, resolveCaps, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import {
	formatRawTextModelFailure,
	generateRawTextWithModel,
} from "@nseng-ai/extension-kit/model-slug";
import {
	parseModelPolicyToml,
	resolveModelOperation,
	type ModelPolicy,
} from "@nseng-ai/extension-kit/model-policy";
import { spinnerFrame, truncatePlain } from "@nseng-ai/ns-foundation/cli-theme";
import type { ModelSelection } from "@nseng-ai/ns-foundation/model-slug";
import { z } from "zod";

import type { NsDevCliContext } from "../context.ts";
import { formatUnknownError, resolvePath } from "../shared.ts";

export const CAVEMAN_MODEL_OPERATION_ID = "ns-dev.caveman";

const MAX_INPUT_CHARS = 100_000;
const SPINNER_FRAME_MS = 90;
const CLEAR_STATUS_LINE = "\r\x1b[2K";

const CAVEMAN_INTENSITIES = ["lite", "full", "ultra"] as const;
export type CavemanIntensity = (typeof CAVEMAN_INTENSITIES)[number];

export const cavemanRequestSchema = z.object({
	text: z.string().optional().describe("Text to compress into caveman style."),
	file: z.string().optional().describe("Read the input text from this file instead."),
	lite: z.boolean().optional().describe("Lite intensity: no filler, keep full sentences."),
	full: z.boolean().optional().describe("Full intensity: classic caveman. Default."),
	ultra: z.boolean().optional().describe("Ultra intensity: maximum compression."),
});

export const cavemanResultSchema = z.object({
	output: z.string(),
	intensity: z.enum(CAVEMAN_INTENSITIES),
	provider: z.string(),
	model: z.string(),
	inputChars: z.number(),
	outputChars: z.number(),
});

type CavemanRequest = z.output<typeof cavemanRequestSchema>;
type CavemanResult = z.output<typeof cavemanResultSchema>;

/**
 * Caveman style guide embedded from the upstream skill
 * (https://github.com/JuliusBrussee/caveman, skills/caveman/SKILL.md), adapted from an
 * interactive response mode into a one-shot text rewrite instruction. Intensity levels
 * match the upstream vocabulary: lite, full, ultra.
 */
const CAVEMAN_STYLE_GUIDE = `Rewrite text terse like smart caveman. All technical substance stay. Only fluff die.

## Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No decorative tables/emoji, no dumping long raw error logs — quote shortest decisive line. Standard well-known tech acronyms OK (DB/API/HTTP); never invent new abbreviations (cfg/impl/req/res/fn) — tokenizer split them same as full word: zero token saved, reader still decode. Full word cheaper AND clearer. No causal arrows (\u2192) either — own token, save nothing. Technical terms exact. Code blocks unchanged. Errors quoted exact.

Preserve the input's dominant language. Input in Portuguese, rewrite in Portuguese caveman. Compress the style, not the language. ALWAYS keep technical terms, code, API names, CLI commands, commit-type keywords (feat/fix/...), and exact error strings verbatim.

No self-reference. Never name or announce the style. No "caveman mode on", no third-person caveman tags. Output rewritten text only — never original text plus recap, never commentary about the rewrite.

Pattern: [thing] [action] [reason]. [next step].

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use \`<\` not \`<=\`. Fix:"

## Intensity

- lite: No filler/hedging. Keep articles + full sentences. Professional but tight.
- full: Drop articles, fragments OK, short synonyms. Classic caveman. No decorative tables/emoji, no long raw error-log dumps. Standard acronyms OK; no invented abbreviations.
- ultra: Strip conjunctions when cause-then-effect stay unambiguous. One word when one word enough. State each fact once. NO prose abbreviations (cfg/impl/req/res/fn/auth), NO arrows (X \u2192 Y). Code symbols, function names, API names, error strings: never touch.

Example — "Why does my React component re-render?"
- lite: "Your component re-renders because you create a new object reference each render. Wrap it in \`useMemo\`."
- full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in \`useMemo\`."
- ultra: "Inline obj prop, new ref, re-render. \`useMemo\`."

## Auto-Clarity

Keep clear, uncompressed phrasing for: security warnings, irreversible action confirmations, multi-step sequences where fragment order or omitted conjunctions risk misread, and anywhere compression itself creates technical ambiguity (e.g. "migrate table drop column backup first" — order unclear without articles/conjunctions). Resume caveman right after the clear part.`;

export function buildCavemanPrompt(text: string, intensity: CavemanIntensity): string {
	return [
		CAVEMAN_STYLE_GUIDE,
		"",
		"## Task",
		"",
		`Rewrite the input below at intensity "${intensity}".`,
		"Output ONLY the rewritten text. No preamble, no explanation, no quotes around the result.",
		"",
		"<input>",
		text,
		"</input>",
	].join("\n");
}

export async function runCaveman(
	context: NsDevCliContext,
	request: CavemanRequest,
): Promise<ClinkrExit<CavemanResult>> {
	const intensity = resolveIntensity(request);
	if (intensity.type === "error") {
		return usageError(intensity.message, { arguments: intensity.arguments });
	}

	const input = await resolveInputText(context, request);
	if (input.type === "error") {
		return usageError(input.message, { argument: input.argument });
	}
	if (input.text.trim().length === 0) {
		return usageError("Input text is empty.", { argument: input.argument });
	}
	if (input.text.length > MAX_INPUT_CHARS) {
		return usageError(
			`Input is ${input.text.length} characters; the limit is ${MAX_INPUT_CHARS}. Split the input.`,
			{ argument: input.argument, inputChars: input.text.length, maxChars: MAX_INPUT_CHARS },
		);
	}

	const policy = await loadCavemanModelPolicy(context);
	if (policy.type === "error") {
		return failure("model-policy-error", policy.message);
	}
	const model = resolveModelOperation(policy.policy, CAVEMAN_MODEL_OPERATION_ID);
	if (!model.ok) {
		return failure("model-policy-error", `Invalid model policy in ns.toml: ${model.error.message}`);
	}

	const inputLabel = input.filePath ?? "input text";
	const stopSpinner = startCavemanSpinner(context, inputLabel, model.value.selection);
	const generated = await generateRawTextWithModel({
		cwd: context.cwd,
		prompt: buildCavemanPrompt(input.text, intensity.value),
		modelSelection: model.value.selection,
		exec: (command, args, options) => context.runCommand(command, args, options),
	}).finally(stopSpinner);
	if (!generated.ok) {
		return failure("model-error", formatRawTextModelFailure(generated.failure));
	}

	const output = generated.evidence.rawOutput
		.replace(/\r\n?/gu, "\n")
		.trim()
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n");
	if (input.filePath !== undefined) {
		try {
			await context.fs.writeText(input.filePath, output);
		} catch (error) {
			return failure(
				"file-write-error",
				`Could not write ${input.filePath}: ${formatUnknownError(error)}`,
				{
					path: input.filePath,
				},
			);
		}
	}
	return ok({
		output,
		intensity: intensity.value,
		provider: generated.evidence.provider,
		model: generated.evidence.model,
		inputChars: input.text.length,
		outputChars: output.length,
	});
}

export function renderCaveman(result: CavemanResult): string {
	return result.output;
}

function startCavemanSpinner(
	context: NsDevCliContext,
	inputLabel: string,
	modelSelection: ModelSelection,
): () => void {
	if (context.status === undefined) return () => undefined;

	const modelRef = `${modelSelection.provider}/${modelSelection.modelId}`;
	const message = `ns-dev caveman: rewriting ${inputLabel} with ${modelRef}…`;
	if (!context.statusIsTty) {
		context.status(`${message}\n`);
		return () => undefined;
	}

	const caps = resolveCaps({
		isTty: true,
		columns: context.statusColumns,
		env: context.env,
	});
	let tick = 0;
	const render = (): void => {
		const frame = spinnerFrame(caps, tick);
		const line = truncatePlain(`${frame} ${message}`, Math.max(1, caps.columns - 1));
		context.status?.(`${CLEAR_STATUS_LINE}${line}`);
		tick += 1;
	};
	render();
	const timer = context.timers.setInterval(render, SPINNER_FRAME_MS);
	return () => {
		timer.cancel();
		context.status?.(CLEAR_STATUS_LINE);
	};
}

interface IntensityResolutionOk {
	type: "ok";
	value: CavemanIntensity;
}

interface IntensityResolutionError {
	type: "error";
	message: string;
	arguments: string[];
}

type IntensityResolution = IntensityResolutionOk | IntensityResolutionError;

function resolveIntensity(request: CavemanRequest): IntensityResolution {
	const selected = CAVEMAN_INTENSITIES.filter((level) => request[level] === true);
	if (selected.length > 1) {
		return {
			type: "error",
			message: "--lite, --full, and --ultra are mutually exclusive.",
			arguments: selected.map((level) => `--${level}`),
		};
	}
	return { type: "ok", value: selected[0] ?? "full" };
}

interface InputResolutionOk {
	type: "ok";
	text: string;
	argument: string;
	filePath?: string;
}

interface InputResolutionError {
	type: "error";
	message: string;
	argument: string;
}

type InputResolution = InputResolutionOk | InputResolutionError;

async function resolveInputText(
	context: NsDevCliContext,
	request: CavemanRequest,
): Promise<InputResolution> {
	if (request.text !== undefined && request.file !== undefined) {
		return {
			type: "error",
			message: "Provide either <text> or --file, not both.",
			argument: "--file",
		};
	}
	if (request.file !== undefined) {
		const filePath = resolvePath(request.file, context);
		if (!(await context.fs.exists(filePath))) {
			return { type: "error", message: `File not found: ${filePath}.`, argument: "--file" };
		}
		return {
			type: "ok",
			text: await context.fs.readText(filePath),
			argument: "--file",
			filePath,
		};
	}
	if (request.text !== undefined) {
		return { type: "ok", text: request.text, argument: "<text>" };
	}
	return {
		type: "error",
		message: "Missing input: pass <text> or --file <path>.",
		argument: "<text>",
	};
}

interface ModelPolicyResolutionOk {
	type: "ok";
	policy: ModelPolicy;
}

interface ModelPolicyResolutionError {
	type: "error";
	message: string;
}

type ModelPolicyResolution = ModelPolicyResolutionOk | ModelPolicyResolutionError;

async function loadCavemanModelPolicy(context: NsDevCliContext): Promise<ModelPolicyResolution> {
	const nsTomlPath = await findNsTomlPath(context);
	if (nsTomlPath === undefined) {
		return {
			type: "error",
			message: `Could not find ns.toml above ${context.cwd}; caveman needs its [models] profiles.`,
		};
	}
	const parsed = parseModelPolicyToml(await context.fs.readText(nsTomlPath), nsTomlPath);
	if (!parsed.ok) {
		return { type: "error", message: `Invalid model policy in ns.toml: ${parsed.error.message}` };
	}
	return { type: "ok", policy: parsed.value };
}

async function findNsTomlPath(context: NsDevCliContext): Promise<string | undefined> {
	let current = resolvePath(context.cwd, context);
	while (true) {
		const candidate = join(current, "ns.toml");
		if (await context.fs.exists(candidate)) return candidate;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

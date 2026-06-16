import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";

import type { SdlContext } from "./sdk.ts";

// Keep the optional model-based failure explanation in one file so deleting this
// feature is mostly removing this import and the two call sites in `submit.ts`.
const SUBMIT_FAILURE_INTERPRETATION_MAX_CHARS = 12_000;
const SUBMIT_FAILURE_MODEL_ENV = "SDL_SUBMIT_FAILURE_MODEL";

export interface SubmitFailureInterpretationInput {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function maybeAppendSubmitFailureInterpretation<T extends SubmitFailureInterpretationInput>(result: T, ctx: SdlContext): Promise<T> {
	if (result.exitCode === 0 || result.stderr.trim() === "") return result;

	const failureText = result.stderr.trim();
	if (isDeterministicSubmitFailure(failureText)) return result;

	const interpretation = await generateSubmitFailureInterpretation({ failureText, exitCode: result.exitCode, ctx });
	if (!interpretation.ok) return result;

	const text = interpretation.text.trim();
	if (text === "") return result;

	const stderr = `${result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`}
----- AI interpretation (model-generated) -----
${text}
----- end AI interpretation -----
`;
	return { ...result, stderr };
}

async function generateSubmitFailureInterpretation(input: {
	failureText: string;
	exitCode: number;
	ctx: SdlContext;
}): Promise<{ ok: true; text: string } | { ok: false }> {
	try {
		const interpretation = await input.ctx.model.generateText({
			modelRef: selectSubmitFailureModelRef(input.ctx.env),
			operation: "submit-failure",
			reasoning: "low",
			maxTokens: 700,
			system: "You explain failed source-control CLI output for engineers. Be concise, specific, and action-oriented. Do not invent facts not present in the output.",
			prompt: buildSubmitFailureInterpretationPrompt({ failureText: input.failureText, exitCode: input.exitCode }),
		});
		if (!interpretation.ok) return { ok: false };
		return interpretation;
	} catch {
		return { ok: false };
	}
}

function isDeterministicSubmitFailure(failureText: string): boolean {
	return failureText.includes("Graphite still requires restack after `sdl submit` already ran `gt restack --no-interactive`.");
}

function selectSubmitFailureModelRef(env: Record<string, string | undefined>): string {
	const modelRef = env[SUBMIT_FAILURE_MODEL_ENV]?.trim();
	return modelRef === undefined || modelRef === "" ? DEFAULT_FAST_MODEL_REF : modelRef;
}

function buildSubmitFailureInterpretationPrompt(input: { failureText: string; exitCode: number }): string {
	const output = truncateSubmitFailureOutput(input.failureText);
	return [
		"Interpret this `sdl submit` failure for the user.",
		"Return exactly two short Markdown sections:",
		"1. `What happened` — one or two sentences describing the likely failure.",
		"2. `Recommended next steps` — concrete commands or checks to run next.",
		"Prefer the command names already present in the output. If the output is ambiguous, say what to inspect instead of guessing.",
		"Pay close attention to Graphite warning blocks and deterministic preamble lines that name branches. If the output says Graphite skipped submission because `branch <name> is empty`, repeat that exact branch name in `What happened` and tell the user to delete it, reparent around it, or add changes before resubmitting.",
		"",
		`Exit code: ${input.exitCode}`,
		"",
		"Output:",
		"```text",
		output,
		"```",
	].join("\n");
}

function truncateSubmitFailureOutput(output: string): string {
	if (output.length <= SUBMIT_FAILURE_INTERPRETATION_MAX_CHARS) return output;
	const omittedChars = output.length - SUBMIT_FAILURE_INTERPRETATION_MAX_CHARS;
	return `${output.slice(0, SUBMIT_FAILURE_INTERPRETATION_MAX_CHARS)}\n… ${omittedChars} trailing character(s) omitted`;
}

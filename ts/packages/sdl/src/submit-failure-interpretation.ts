import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";
import type { SubmitFailurePresentation, SubmitFailureTranscript } from "@asdl/core/submit";

import type { SdlContext } from "./sdk.ts";

// Keep the optional model-based failure explanation in one file so deleting this
// feature is mostly removing this import and the two call sites in `submit.ts`.
const SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS = 12_000;
const SUBMIT_FAILURE_MODEL_ENV = "SDL_SUBMIT_FAILURE_MODEL";
const SUBMIT_FAILURE_LOG_DIR_ENV = "SDL_SUBMIT_FAILURE_LOG_DIR";

export interface SubmitFailureInterpretationInput {
	stdout: string;
	stderr: string;
	exitCode: number;
	failurePresentation?: SubmitFailurePresentation | undefined;
	rawFailureTranscript?: SubmitFailureTranscript | undefined;
}

export async function maybeFormatSubmitFailureWithModel<T extends SubmitFailureInterpretationInput>(
	result: T,
	ctx: SdlContext,
): Promise<T> {
	if (result.exitCode === 0 || result.stderr.trim() === "") return result;

	const rawTranscript = renderRawFailureTranscript(result);
	const rawLog = await writeSubmitFailureRawLog(rawTranscript, ctx.env);
	const interpretation = await generateSubmitFailureInterpretation({
		rawTranscript,
		exitCode: result.exitCode,
		ctx,
	});

	if (interpretation.ok && interpretation.text.trim() !== "") {
		return {
			...result,
			stderr: formatModelPrimaryFailure({ text: interpretation.text, rawLog }),
		} as T;
	}

	return {
		...result,
		stderr: formatOriginalFailureFallback({ stderr: result.stderr, rawLog }),
	} as T;
}

async function generateSubmitFailureInterpretation(input: {
	rawTranscript: string;
	exitCode: number;
	ctx: SdlContext;
}): Promise<{ ok: true; text: string } | { ok: false }> {
	try {
		const interpretation = await input.ctx.model.generateText({
			modelRef: selectSubmitFailureModelRef(input.ctx.env),
			operation: "submit-failure",
			reasoning: "low",
			maxTokens: 700,
			system:
				"You write plain terminal-facing failure summaries for engineers. Be concise, specific, and action-oriented. Output only the final user-facing message. Do not invent facts not present in the transcript. Do not paste raw logs or raw-log paths; the wrapper appends the raw-log line separately.",
			prompt: buildSubmitFailureInterpretationPrompt({
				rawTranscript: input.rawTranscript,
				exitCode: input.exitCode,
			}),
		});
		if (!interpretation.ok) return { ok: false };
		return interpretation;
	} catch {
		return { ok: false };
	}
}

function selectSubmitFailureModelRef(env: Record<string, string | undefined>): string {
	const modelRef = env[SUBMIT_FAILURE_MODEL_ENV]?.trim();
	return modelRef === undefined || modelRef === "" ? DEFAULT_FAST_MODEL_REF : modelRef;
}

function buildSubmitFailureInterpretationPrompt(input: {
	rawTranscript: string;
	exitCode: number;
}): string {
	const bounded = boundSubmitFailureTranscript(input.rawTranscript);
	return [
		"Interpret this `sdl submit` failure for the user.",
		"Your output is the primary user-facing error message.",
		"Output only plain terminal text: no Markdown headings, no bold markers, and no fenced code blocks.",
		"The first line must be the diagnosis.",
		"Use short labeled sections where useful: Problem:, Branch:, What succeeded:, Next step:, Alternative:, Details:.",
		"Include only facts supported by the transcript.",
		"Prefer exact commands already present in the transcript.",
		"If the failure is ambiguous, say what to inspect instead of guessing.",
		"Do not paste raw logs.",
		"Do not include the raw-log path; the wrapper appends exactly one raw-log line after your text.",
		"Empty-branch rule: if the transcript says Graphite skipped submission because branch <name> is empty or because the current branch has no changes, make the first line close to: Current branch is empty; Graphite skipped it.",
		"For empty branches, repeat the exact branch name when known, mention non-empty branches may already have been submitted or updated when stdout says PRs were updated, make the primary next step remove/delete/reparent around the empty branch if it has no remaining work, and present adding real changes only as the alternative when the branch should still have its own PR.",
		"Do not present add/delete/reparent as equal choices for empty branches.",
		"",
		`Exit code: ${input.exitCode}`,
		`Transcript limit: ${SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS} characters`,
		bounded.truncated
			? `Truncation: transcript was truncated from ${input.rawTranscript.length} to ${bounded.text.length} characters.`
			: "Truncation: transcript was not truncated.",
		"",
		"Bounded transcript:",
		bounded.text,
	].join("\n");
}

function boundSubmitFailureTranscript(output: string): { text: string; truncated: boolean } {
	if (output.length <= SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS)
		return { text: output, truncated: false };
	const omittedChars = output.length - SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS;
	return {
		text: `${output.slice(0, SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS)}\n… ${omittedChars} trailing character(s) omitted`,
		truncated: true,
	};
}

async function writeSubmitFailureRawLog(
	rawTranscript: string,
	env: Record<string, string | undefined>,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
	try {
		const baseDir = env[SUBMIT_FAILURE_LOG_DIR_ENV]?.trim() || tmpdir();
		const dir = await mkdtemp(join(baseDir, "sdl-submit-failure-"));
		const path = join(dir, "raw.log");
		await writeFile(path, rawTranscript, "utf8");
		return { ok: true, path };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}

function formatModelPrimaryFailure(input: {
	text: string;
	rawLog: { ok: true; path: string } | { ok: false; message: string };
}): string {
	return appendRawLogLine(input.text.trim(), input.rawLog);
}

function formatOriginalFailureFallback(input: {
	stderr: string;
	rawLog: { ok: true; path: string } | { ok: false; message: string };
}): string {
	return appendRawLogLine(input.stderr.trimEnd(), input.rawLog);
}

function appendRawLogLine(
	text: string,
	rawLog: { ok: true; path: string } | { ok: false; message: string },
): string {
	const rawLogLine = formatRawLogLine(rawLog);
	if (text.split("\n").includes(rawLogLine)) return `${text}\n`;
	return `${text}\n\n${rawLogLine}\n`;
}

function formatRawLogLine(
	rawLog: { ok: true; path: string } | { ok: false; message: string },
): string {
	if (rawLog.ok) return `Raw log: ${rawLog.path}`;
	return `Raw log: unavailable (${rawLog.message})`;
}

function renderRawFailureTranscript(result: SubmitFailureInterpretationInput): string {
	const transcript = result.rawFailureTranscript;
	if (transcript === undefined) {
		return renderLegacyRawFailureTranscript(result);
	}

	const lines = [
		"sdl submit failure raw log",
		`phase: ${transcript.phase}`,
		`exit code: ${result.exitCode}`,
	];
	if (transcript.summary !== undefined && transcript.summary.trim() !== "") {
		lines.push("", "summary:", transcript.summary.trimEnd());
	}
	for (const [index, command] of transcript.commands.entries()) {
		lines.push(
			"",
			`command ${index + 1}: ${command.commandDisplay ?? "unknown"}`,
			`exit code: ${command.exitCode}`,
		);
		if (command.startupError !== undefined) lines.push(`startup error: ${command.startupError}`);
		if (command.killed === true) lines.push("killed: true");
		lines.push(
			"",
			"----- stdout -----",
			command.stdout === "" ? "(empty)" : command.stdout.trimEnd(),
			"----- stderr -----",
			command.stderr === "" ? "(empty)" : command.stderr.trimEnd(),
		);
	}
	return `${lines.join("\n")}\n`;
}

function renderLegacyRawFailureTranscript(result: SubmitFailureInterpretationInput): string {
	return [
		"sdl submit failure raw log",
		"phase: unknown",
		`exit code: ${result.exitCode}`,
		"",
		"----- stdout -----",
		result.stdout === "" ? "(empty)" : result.stdout.trimEnd(),
		"----- stderr -----",
		result.stderr === "" ? "(empty)" : result.stderr.trimEnd(),
		"",
	].join("\n");
}

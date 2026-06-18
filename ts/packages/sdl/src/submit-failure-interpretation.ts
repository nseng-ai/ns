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

export async function maybeFormatUnknownSubmitFailureWithModel<T extends SubmitFailureInterpretationInput>(result: T, ctx: SdlContext): Promise<T> {
	if (result.exitCode === 0 || result.stderr.trim() === "") return result;
	if (isDeterministicSubmitFailure(result)) return result;

	const rawTranscript = renderRawFailureTranscript(result);
	const rawLog = await writeSubmitFailureRawLog(rawTranscript, ctx.env);
	const interpretation = await generateSubmitFailureInterpretation({
		rawTranscript,
		rawLogPath: rawLog.ok ? rawLog.path : undefined,
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
		stderr: formatModelUnavailableFailure(rawLog),
	} as T;
}

async function generateSubmitFailureInterpretation(input: {
	rawTranscript: string;
	rawLogPath?: string | undefined;
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
				"You write polished terminal-facing failure messages for engineers. Be concise, specific, and action-oriented. Do not invent facts not present in the transcript. Do not paste raw logs; the user already has a raw-log path when available.",
			prompt: buildSubmitFailureInterpretationPrompt({
				rawTranscript: input.rawTranscript,
				rawLogPath: input.rawLogPath,
				exitCode: input.exitCode,
			}),
		});
		if (!interpretation.ok) return { ok: false };
		return interpretation;
	} catch {
		return { ok: false };
	}
}

function isDeterministicSubmitFailure(result: SubmitFailureInterpretationInput): boolean {
	if (result.failurePresentation === "deterministic") return true;
	if (result.failurePresentation === "unknown") return false;

	const failureText = result.stderr.trim();
	return failureText.includes("Graphite still requires restack after `sdl submit` already ran `gt restack --no-interactive`.");
}

function selectSubmitFailureModelRef(env: Record<string, string | undefined>): string {
	const modelRef = env[SUBMIT_FAILURE_MODEL_ENV]?.trim();
	return modelRef === undefined || modelRef === "" ? DEFAULT_FAST_MODEL_REF : modelRef;
}

function buildSubmitFailureInterpretationPrompt(input: { rawTranscript: string; rawLogPath?: string | undefined; exitCode: number }): string {
	const bounded = boundSubmitFailureTranscript(input.rawTranscript);
	return [
		"Interpret this `sdl submit` failure for the user.",
		"Your output is the primary user-facing error message, so make it polished Markdown suitable for terminal display.",
		"Use concise sections such as `## What happened` and `## Recommended next steps`.",
		"Prefer exact commands already present in the transcript. If the failure is ambiguous, say what to inspect instead of guessing.",
		"Do not include giant raw logs; full raw logs are available separately when a path is provided.",
		"Pay close attention to Graphite warning blocks and deterministic preamble lines that name branches. If the output says Graphite skipped submission because `branch <name> is empty`, repeat that exact branch name and tell the user to delete it, reparent around it, or add changes before resubmitting.",
		"",
		`Exit code: ${input.exitCode}`,
		input.rawLogPath === undefined ? "Raw log path: unavailable" : `Raw log path: ${input.rawLogPath}`,
		`Transcript limit: ${SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS} characters`,
		bounded.truncated ? `Truncation: transcript was truncated from ${input.rawTranscript.length} to ${bounded.text.length} characters.` : "Truncation: transcript was not truncated.",
		"",
		"Bounded transcript:",
		"```text",
		bounded.text,
		"```",
	].join("\n");
}

function boundSubmitFailureTranscript(output: string): { text: string; truncated: boolean } {
	if (output.length <= SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS) return { text: output, truncated: false };
	const omittedChars = output.length - SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS;
	return {
		text: `${output.slice(0, SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS)}\n… ${omittedChars} trailing character(s) omitted`,
		truncated: true,
	};
}

async function writeSubmitFailureRawLog(rawTranscript: string, env: Record<string, string | undefined>): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
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

function formatModelPrimaryFailure(input: { text: string; rawLog: { ok: true; path: string } | { ok: false; message: string } }): string {
	return ["## Submit failed", "", input.text.trim(), "", ...formatRawLogLines(input.rawLog)].join("\n");
}

function formatModelUnavailableFailure(rawLog: { ok: true; path: string } | { ok: false; message: string }): string {
	return [
		"sdl submit failed, and the failure could not be interpreted automatically.",
		...formatRawLogLines(rawLog),
		"Rerun `sdl submit --verbose` or inspect the raw log details for the underlying Graphite output.",
	].join("\n");
}

function formatRawLogLines(rawLog: { ok: true; path: string } | { ok: false; message: string }): string[] {
	if (rawLog.ok) return [`Raw logs: ${rawLog.path}`];
	return [`Raw logs: unavailable (${rawLog.message})`];
}

function renderRawFailureTranscript(result: SubmitFailureInterpretationInput): string {
	const transcript = result.rawFailureTranscript;
	if (transcript === undefined) {
		return renderLegacyRawFailureTranscript(result);
	}

	const lines = ["sdl submit failure raw log", `phase: ${transcript.phase}`, `exit code: ${result.exitCode}`];
	if (transcript.summary !== undefined && transcript.summary.trim() !== "") {
		lines.push("", "summary:", transcript.summary.trimEnd());
	}
	for (const [index, command] of transcript.commands.entries()) {
		lines.push("", `command ${index + 1}: ${command.commandDisplay ?? "unknown"}`, `exit code: ${command.exitCode}`);
		if (command.startupError !== undefined) lines.push(`startup error: ${command.startupError}`);
		if (command.killed === true) lines.push("killed: true");
		lines.push("", "----- stdout -----", command.stdout === "" ? "(empty)" : command.stdout.trimEnd(), "----- stderr -----", command.stderr === "" ? "(empty)" : command.stderr.trimEnd());
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

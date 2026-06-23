import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { RealCheckpointGateway, runCheckpointIfPending } from "@sdl/sdl/checkpoint";
import { createSdlSubmitRuntime, runSubmitCommand, type SubmitCommandResult } from "@sdl/sdl/submit";
import { selectSubmitFailureModelRef } from "@sdl/sdl/text-generation";
import { defineExtension, failed, ok, z, type SdlExtensionApi, type SdlOutputStream } from "@sdl/sdl/sdk";

const SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS = 12_000;
const SUBMIT_FAILURE_LOG_DIR_ENV = "SDL_SUBMIT_FAILURE_LOG_DIR";

const submitSchema = z.object({
  restack: z
    .boolean()
    .default(true)
    .describe("Automatically run gt restack before submitting when Graphite requires it."),
  verbose: z.boolean().default(false).describe("Stream raw Graphite/subprocess output while submitting."),
});

const SUBMIT_COMMAND_DESCRIPTION = `Checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors with gt submit --no-edit --publish --no-stack --no-ai --no-interactive.

Environment:
  SDL_CHECKPOINT_MODEL           Model reference for generated checkpoint messages. Falls back to SDL_DEV_CHECKPOINT_MODEL.
  SDL_DEV_PR_DESCRIPTION_MODEL   Model reference for generated PR descriptions.
  SDL_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

  SDL_SUBMIT_FAILURE_MODEL       Model reference for summarizing submit failures.
  SDL_SUBMIT_FAILURE_LOG_DIR     Optional directory for raw submit-failure transcripts.

The command owns its output and exit code. It does not support --format.`;

type SubmitRequest = z.output<typeof submitSchema>;
type SubmitLiveOutput = (stream: SdlOutputStream, text: string) => void;

export default defineExtension({
  commands: [
    {
      name: "submit",
      summary: "Checkpoint pending changes, then submit the Graphite stack with gt submit.",
      description: SUBMIT_COMMAND_DESCRIPTION,
      schema: submitSchema,
      async run(ctx: SdlExtensionApi, request: SubmitRequest) {
        const runtime = createSdlSubmitRuntime(ctx);
        const liveOutput = createSubmitLiveOutput(ctx);
        emitSubmitProgress(liveOutput, "sdl flow submit");
        emitSubmitProgress(liveOutput, "• Checking worktree and checkpointing pending changes if needed…");

        const checkpoint = await runCheckpointIfPending({
          cwd: ctx.cwd,
          env: ctx.env,
          gateway: new RealCheckpointGateway(runtime.commandRunner),
          textGenerator: ctx.textGenerator,
        });
        if (checkpoint.kind === "failed") {
          const checkpointFailure = await maybeFormatSubmitFailureWithModel(
            {
              stdout: "",
              stderr: formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr),
              exitCode: checkpoint.output.exitCode,
            },
            ctx,
          );
          ctx.stderr?.(checkpointFailure.stderr);
          return failed("", checkpoint.output.exitCode);
        }
        if (checkpoint.kind === "checkpointed") {
          writeCommandResultOutput(checkpoint.output, ctx);
        }

        emitSubmitProgress(liveOutput, "✓ Checkpoint phase complete");
        const result = await runSubmitCommand({
          cwd: ctx.cwd,
          gateway: runtime.submitGateway,
          metadataGateway: runtime.metadataGateway,
          restack: request.restack,
          shouldForwardCommandOutput: request.verbose,
          prDescription: runtime.prDescription,
          ...(liveOutput === undefined ? {} : { onOutput: liveOutput }),
        });
        const interpretedResult = await maybeFormatSubmitFailureWithModel(result, ctx);
        writeCommandResultOutput(interpretedResult, ctx);
        return interpretedResult.exitCode === 0 ? ok("") : failed("", interpretedResult.exitCode);
      },
    },
  ],
});

function createSubmitLiveOutput(ctx: SdlExtensionApi): SubmitLiveOutput | undefined {
  if (ctx.onOutput !== undefined) return ctx.onOutput;
  if (ctx.stdout === undefined && ctx.stderr === undefined) return undefined;
  return (stream, text) => {
    if (stream === "stdout") {
      ctx.stdout?.(text);
      return;
    }
    ctx.stderr?.(text);
  };
}

function emitSubmitProgress(liveOutput: SubmitLiveOutput | undefined, message: string): void {
  liveOutput?.("stderr", `${message}\n`);
}

function writeCommandResultOutput(
  result: Pick<SubmitCommandResult, "stdout" | "stderr">,
  ctx: SdlExtensionApi,
): void {
  if (result.stdout !== "") {
    ctx.stdout?.(result.stdout);
  }
  if (result.stderr !== "") {
    ctx.stderr?.(result.stderr);
  }
}

function formatCheckpointBeforeSubmitFailure(stderr: string): string {
  const trimmed = stderr.trimEnd();
  const message =
    trimmed === ""
      ? "Checkpoint before submit failed. Submission was not attempted."
      : `Checkpoint before submit failed. Submission was not attempted.\n\n${trimmed}`;
  return `${message}\n`;
}

async function maybeFormatSubmitFailureWithModel(
  result: SubmitCommandResult,
  ctx: SdlExtensionApi,
): Promise<SubmitCommandResult> {
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
    };
  }
  return {
    ...result,
    stderr: formatOriginalFailureFallback({ stderr: result.stderr, rawLog }),
  };
}

async function generateSubmitFailureInterpretation(input: {
  rawTranscript: string;
  exitCode: number;
  ctx: SdlExtensionApi;
}): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    const interpretation = await input.ctx.textGenerator.generateText({
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

function buildSubmitFailureInterpretationPrompt(input: {
  rawTranscript: string;
  exitCode: number;
}): string {
  const bounded = boundSubmitFailureTranscript(input.rawTranscript);
  return [
    "Interpret this `sdl flow submit` failure for the user.",
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
  if (output.length <= SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS) {
    return { text: output, truncated: false };
  }
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
    const baseDir = resolveSubmitFailureLogRoot(env);
    await ensurePrivateDirectory(baseDir);
    const dir = await mkdtemp(join(baseDir, "sdl-submit-failure-"));
    const path = join(dir, "raw.log");
    await writeFile(path, rawTranscript, "utf8");
    return { ok: true, path };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700).catch(() => undefined);
}

function resolveSubmitFailureLogRoot(env: Record<string, string | undefined>): string {
  const override = env[SUBMIT_FAILURE_LOG_DIR_ENV]?.trim();
  if (override !== undefined && override !== "") return override;
  const stateHome = env.XDG_STATE_HOME?.trim();
  if (stateHome !== undefined && stateHome !== "") {
    return join(stateHome, "sdl", "submit-failure-logs");
  }
  const home = env.HOME?.trim();
  if (home !== undefined && home !== "") {
    return join(home, ".local", "state", "sdl", "submit-failure-logs");
  }
  return join(process.cwd(), ".sdl", "state", "submit-failure-logs");
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

function formatRawLogLine(rawLog: { ok: true; path: string } | { ok: false; message: string }): string {
  if (rawLog.ok) return `Raw log: ${rawLog.path}`;
  return `Raw log: unavailable (${rawLog.message})`;
}

function renderRawFailureTranscript(result: SubmitCommandResult): string {
  const transcript = result.rawFailureTranscript;
  if (transcript === undefined) {
    return renderLegacyRawFailureTranscript(result);
  }
  const lines = [
    "sdl flow submit failure raw log",
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

function renderLegacyRawFailureTranscript(result: SubmitCommandResult): string {
  return [
    "sdl flow submit failure raw log",
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

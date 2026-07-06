import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import type { Caps } from "@nseng-ai/clinkr";
import { RealCheckpointGateway, runCheckpointIfPending } from "../../checkpoint/checkpoint.ts";
import { createFlowLiveOutput, type FlowLiveOutput } from "../../phase-stream/live-output.ts";
import {
	flowStreamDeps,
	resolveFlowStreamCaps,
	runSettledPhaseStream,
	SUBMIT_HOOKS_PHASE,
	SUBMIT_PHASES,
} from "../../phase-stream/phase-stream.ts";
import {
	createNsSubmitRuntime,
	runSubmitCommand,
	type NsSubmitRuntime,
	type SubmitCommandResult,
} from "../../submit/ns-runtime.ts";
import {
	createSubmitMatrixProgressController,
	submitMatrixRowsFromTopology,
	type SubmitMatrixProgressController,
} from "../../submit/submit-matrix-progress.ts";
import {
	flowSubmitHookFailureExitCode,
	formatFlowSubmitHookFailure,
	loadFlowSubmitHooks,
	runFlowSubmitHooks,
} from "../../submit/submit-hooks.ts";
import { selectSubmitFailureModelRef } from "@nseng-ai/capability-kit/text-generation";
import {
	defineExtension,
	failed,
	ok,
	z,
	type NsCommand,
	type NsExtensionApi,
	type NsProgressPhaseEvent,
} from "@nseng-ai/kernel/sdk";

const SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS = 12_000;
const SUBMIT_FAILURE_LOG_DIR_ENV = "NS_SUBMIT_FAILURE_LOG_DIR";

const submitSchema = z.object({
	restack: z
		.boolean()
		.default(true)
		.describe("Automatically run gt restack before submitting when Graphite requires it."),
	force: z
		.boolean()
		.default(false)
		.describe("Pass --force to Graphite submit readiness checks and the submit run."),
	verbose: z
		.boolean()
		.default(false)
		.describe("Stream raw Graphite/subprocess output while submitting."),
	hooks: z
		.boolean()
		.default(true)
		.describe(
			"Run pre-submit hooks from the repo-root ns.toml ([flow.hooks] pre_submit) before checkpointing. Use --no-hooks to skip.",
		),
});

const SUBMIT_COMMAND_DESCRIPTION = `Run configured pre-submit hooks, checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors with gt submit --no-edit --publish --no-stack --no-ai --no-interactive.

Pre-submit hooks are consumer config in the repo-root ns.toml ([flow.hooks] pre_submit, an array of command strings such as ["just"]). Each entry is whitespace-split and executed directly without a shell; the first failing hook aborts the submit. Skip them with --no-hooks.

Environment:
  NS_CHECKPOINT_MODEL           Model reference for generated checkpoint messages. Falls back to NS_DEV_CHECKPOINT_MODEL.
  NS_DEV_PR_DESCRIPTION_MODEL   Model reference for generated PR descriptions.
  NS_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

  NS_SUBMIT_FAILURE_MODEL       Model reference for summarizing submit failures.
  NS_SUBMIT_FAILURE_LOG_DIR     Optional directory for raw submit-failure transcripts.

The command owns its output and exit code. It does not support --format.`;

type SubmitRequest = z.output<typeof submitSchema>;

export const flowSubmitCommand: NsCommand<typeof submitSchema> = {
	name: "submit",
	summary: "Checkpoint pending changes, then submit the Graphite stack with gt submit.",
	description: SUBMIT_COMMAND_DESCRIPTION,
	schema: submitSchema,
	options: {
		restack: { short: "-R" },
		force: { short: "-f" },
		verbose: { short: "-v" },
	},
	async run(ctx: NsExtensionApi, request: SubmitRequest) {
		const runtime = createNsSubmitRuntime(ctx);
		const hooksLoad = request.hooks
			? await loadFlowSubmitHooks({ cwd: ctx.cwd, runner: runtime.commandRunner })
			: { kind: "none" as const };
		if (hooksLoad.kind === "invalid") {
			return failed(hooksLoad.error.message, 2);
		}
		const caps = resolveFlowStreamCaps(ctx);
		if (caps.isTty) {
			return await runSubmitWithMatrix({ ctx, request, runtime, caps });
		}
		return await runSettledPhaseStream({
			caps,
			specs: hooksLoad.kind === "hooks" ? [SUBMIT_HOOKS_PHASE, ...SUBMIT_PHASES] : SUBMIT_PHASES,
			deps: flowStreamDeps(ctx, caps),
			forward: ctx.progress,
			title: "ns flow submit",
			body: async (stream) => {
				// The raw subprocess transcript (hooks and `gt submit`) streams on its own channel (live +
				// --verbose), separate from the typed phase events that drive the live region. In a TTY it must
				// ride INSIDE the live region as a tail line (via `stream.note`) so the sink's writer stays the
				// sole owner of stdout; writing it straight to the context desynced log-update and
				// duplicated/scrolled the region. Non-TTY (Pi / pipe) streams the transcript to the context.
				const rawTranscript = createFlowLiveOutput(ctx);
				const onOutput: FlowLiveOutput | undefined = caps.isTty
					? (_stream, text) => stream.note(text)
					: rawTranscript;

				if (hooksLoad.kind === "hooks") {
					stream.emit({ type: "phase-started", phaseKey: "hooks" });
					const hooksOutcome = await runFlowSubmitHooks({
						hooks: hooksLoad.hooks,
						runner: runtime.commandRunner,
						onHookStarted: ({ hook, index, total }) =>
							stream.emit({
								type: "phase-progress",
								phaseKey: "hooks",
								label:
									total === 1
										? `running ${hook.display}…`
										: `running ${hook.display} (${index + 1}/${total})…`,
							}),
						...(onOutput === undefined
							? {}
							: { onOutput: (outputStream, text) => onOutput(outputStream, text) }),
					});
					if (hooksOutcome.kind === "failed") {
						const hookFailure = await maybeFormatSubmitFailureWithModel(
							{
								stdout: "",
								stderr: formatFlowSubmitHookFailure(hooksOutcome),
								exitCode: flowSubmitHookFailureExitCode(hooksOutcome),
								failurePresentation: "deterministic",
							},
							ctx,
						);
						return {
							result: failed(resultFailureMessage(hookFailure), hookFailure.exitCode),
							isFailed: true,
						};
					}
				}

				// Keep the parent checkpoint phase active for the clean-worktree path, while routing the
				// workflow's keyed inspect/generate/commit events to the declared substeps.
				stream.emit({ type: "phase-started", phaseKey: "checkpoint" });
				const checkpoint = await runCheckpointIfPending({
					cwd: ctx.cwd,
					env: ctx.env,
					gateway: new RealCheckpointGateway(runtime.commandRunner),
					textGenerator: ctx.textGenerator,
					onPhase: stream.emit,
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
					return {
						result: failed(resultFailureMessage(checkpointFailure), checkpoint.output.exitCode),
						isFailed: true,
					};
				}

				const result = await runSubmitCommand({
					cwd: ctx.cwd,
					gateway: runtime.submitGateway,
					metadataGateway: runtime.metadataGateway,
					restack: request.restack,
					force: request.force,
					shouldForwardCommandOutput: request.verbose,
					prDescription: runtime.prDescription,
					onPhase: stream.emit,
					...(onOutput === undefined ? {} : { onOutput }),
				});
				// Result payloads print as scrollback below the settled region: the checkpoint commit summary
				// (if any) first, then the submit success text or interpreted failure.
				const interpretedResult = await maybeFormatSubmitFailureWithModel(result, ctx);
				const isFailed = interpretedResult.exitCode !== 0;
				return {
					result: isFailed
						? failed(resultFailureMessage(interpretedResult), interpretedResult.exitCode)
						: ok(""),
					isFailed,
					afterFinish: () => {
						if (checkpoint.kind === "checkpointed") {
							writeCommandResultOutput(checkpoint.output, ctx);
						}
						writeCommandResultOutput(
							isFailed ? { ...interpretedResult, stderr: "" } : interpretedResult,
							ctx,
						);
					},
				};
			},
		});
	},
};

export default defineExtension({
	commands: [flowSubmitCommand],
});

async function runSubmitWithMatrix(input: {
	ctx: NsExtensionApi;
	request: SubmitRequest;
	runtime: NsSubmitRuntime;
	caps: Caps;
}) {
	const { ctx, request, runtime, caps } = input;
	const matrix = createSubmitMatrixProgressController({
		caps,
		deps: flowStreamDeps(ctx, caps),
		title: "ns flow submit",
		rows: [],
		...(ctx.progress.isLive ? { forward: ctx.progress } : {}),
	});
	matrix.setGlobal("inventory", { state: "active" });
	matrix.begin();

	try {
		matrix.setRunningCommands([
			"gt log --stack --reverse --no-interactive",
			"gt trunk --no-interactive",
			"gt branch info --no-interactive --branch <stack-branch>",
		]);
		const topology = await runtime.metadataGateway.inspectSubmitStackTopology({ cwd: ctx.cwd });
		matrix.setRunningCommands([]);
		if (!topology.ok) {
			matrix.setGlobal("inventory", { state: "failed", text: "inventory failed" });
			await matrix.finish({ isFailed: true });
			return failed(
				`Could not inspect submit stack inventory before checkpoint. Submission was not attempted; pending work was not checkpointed.\n\n${topology.error.message}`,
				1,
			);
		}
		matrix.setRows(submitMatrixRowsFromTopology(topology.value));
		matrix.setGlobal("inventory", {
			state: "done",
			text: `${topology.value.branches.length} ${topology.value.branches.length === 1 ? "branch" : "branches"} in submit stack`,
		});
		const checkpointPhase = createMatrixPhaseForwarder(ctx, matrix);
		checkpointPhase({ type: "phase-started", phaseKey: "checkpoint" });
		matrix.setGlobal("checkpoint", { state: "active" });
		const checkpoint = await runCheckpointIfPending({
			cwd: ctx.cwd,
			env: ctx.env,
			gateway: new RealCheckpointGateway(runtime.commandRunner),
			textGenerator: ctx.textGenerator,
			onPhase: checkpointPhase,
		});
		matrix.setRunningCommands([]);
		if (checkpoint.kind === "failed") {
			matrix.setGlobal("checkpoint", { state: "failed", text: "checkpoint failed" });
			const checkpointFailure = await maybeFormatSubmitFailureWithModel(
				{
					stdout: "",
					stderr: formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr),
					exitCode: checkpoint.output.exitCode,
				},
				ctx,
			);
			await matrix.finish({ isFailed: true });
			return failed(resultFailureMessage(checkpointFailure), checkpoint.output.exitCode);
		}
		matrix.setGlobal("checkpoint", { state: "done", text: "checkpoint complete" });

		const onPhase = createForwardOnlyPhaseListener(ctx);
		const onOutput: FlowLiveOutput = (_stream, text) => matrix.note(text);
		const result = await runSubmitCommand({
			cwd: ctx.cwd,
			gateway: runtime.submitGateway,
			metadataGateway: runtime.metadataGateway,
			restack: request.restack,
			force: request.force,
			shouldForwardCommandOutput: request.verbose,
			prDescription: runtime.prDescription,
			onPhase,
			onOutput,
			submitMatrix: matrix,
			submitMatrixCurrentBranch: topology.value.currentBranch,
		});
		const interpretedResult = await maybeFormatSubmitFailureWithModel(result, ctx);
		const isFailed = interpretedResult.exitCode !== 0;
		await matrix.finish({ isFailed });
		if (checkpoint.kind === "checkpointed") {
			writeCommandResultOutput(checkpoint.output, ctx);
		}
		writeCommandResultOutput(
			isFailed ? { ...interpretedResult, stderr: "" } : interpretedResult,
			ctx,
		);
		return isFailed
			? failed(resultFailureMessage(interpretedResult), interpretedResult.exitCode)
			: ok("");
	} finally {
		await matrix.stop();
	}
}

function createMatrixPhaseForwarder(
	ctx: NsExtensionApi,
	matrix: SubmitMatrixProgressController,
): (event: NsProgressPhaseEvent) => void {
	const forward = createForwardOnlyPhaseListener(ctx);
	return (event) => {
		forward(event);
		matrix.applyGlobalPhaseEvent("checkpoint", event);
	};
}

function createForwardOnlyPhaseListener(
	ctx: NsExtensionApi,
): (event: NsProgressPhaseEvent) => void {
	return (event) => {
		if (ctx.progress.isLive) ctx.progress.phase(event);
	};
}

function resultFailureMessage(result: SubmitCommandResult): string {
	const message = result.stderr.trimEnd();
	if (message !== "") return message;
	return `ns flow submit failed with exit code ${result.exitCode}.`;
}

function writeCommandResultOutput(
	result: Pick<SubmitCommandResult, "stdout" | "stderr">,
	ctx: NsExtensionApi,
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
	ctx: NsExtensionApi,
): Promise<SubmitCommandResult> {
	if (result.exitCode === 0 || result.stderr.trim() === "") return result;
	const rawTranscript = renderRawFailureTranscript(result);
	const rawLog = await writeSubmitFailureRawLog(rawTranscript, ctx.env);
	// Failures we classified deterministically already carry a precise, hand-written
	// message. Present it verbatim (plus the raw-log pointer); the model interpreter is
	// only for turning unrecognized Graphite/subprocess output into guidance.
	if (result.failurePresentation === "deterministic") {
		return { ...result, stderr: formatFailureWithRawLog({ stderr: result.stderr, rawLog }) };
	}
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
		stderr: formatFailureWithRawLog({ stderr: result.stderr, rawLog }),
	};
}

async function generateSubmitFailureInterpretation(input: {
	rawTranscript: string;
	exitCode: number;
	ctx: NsExtensionApi;
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
		"Interpret this `ns flow submit` failure for the user.",
		"Your output is the primary user-facing error message.",
		"Output only plain terminal text: no Markdown headings, no bold markers, and no fenced code blocks.",
		"Be terse. The first line is a plain-language diagnosis of what went wrong.",
		"Then give the concrete next step(s) to fix it on a line prefixed with `Fix:` (add a `Bypass:` line only if the transcript shows an override flag such as --force).",
		"Keep it to a few short lines. Do not add labeled sections, restate the same point multiple ways, or narrate what succeeded.",
		"Include only facts supported by the transcript, and prefer exact commands already present in it.",
		"If the failure is ambiguous, say what to inspect instead of guessing.",
		"Do not paste raw logs.",
		"Do not include the raw-log path; the wrapper appends exactly one raw-log line after your text.",
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
		const dir = await mkdtemp(join(baseDir, "ns-submit-failure-"));
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
		return join(stateHome, "ns", "submit-failure-logs");
	}
	const home = env.HOME?.trim();
	if (home !== undefined && home !== "") {
		return join(home, ".local", "state", "ns", "submit-failure-logs");
	}
	return join(process.cwd(), ".ns", "state", "submit-failure-logs");
}

function formatModelPrimaryFailure(input: {
	text: string;
	rawLog: { ok: true; path: string } | { ok: false; message: string };
}): string {
	return appendRawLogLine(input.text.trim(), input.rawLog);
}

function formatFailureWithRawLog(input: {
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

function renderRawFailureTranscript(result: SubmitCommandResult): string {
	const transcript = result.rawFailureTranscript;
	if (transcript === undefined) {
		return renderLegacyRawFailureTranscript(result);
	}
	const lines = [
		"ns flow submit failure raw log",
		`phase: ${transcript.phase}`,
		`exit code: ${result.exitCode}`,
	];
	if (transcript.summary !== undefined && transcript.summary.trim() !== "") {
		lines.push("", "summary:", transcript.summary.trimEnd());
	}
	if (transcript.details !== undefined && transcript.details.length > 0) {
		lines.push("", "details:", transcript.details.map((detail) => detail.trimEnd()).join("\n"));
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
		"ns flow submit failure raw log",
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

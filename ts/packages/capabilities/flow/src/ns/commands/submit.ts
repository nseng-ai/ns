import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { runCheckpointIfPending } from "../../checkpoint/checkpoint.ts";
import {
	createFlowLiveOutput,
	emitFlowProgress,
	type FlowLiveOutput,
} from "../../phase-stream/live-output.ts";
import { flowStreamDeps, resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import {
	createNsSubmitRuntime,
	runSubmitCommand,
	type NsSubmitRuntime,
	type SubmitCommandResult,
} from "../../submit/ns-runtime.ts";
import type {
	FlowMinimalSubmitClient,
	FlowMinimalSubmitPhaseEvent,
	FlowMinimalSubmitPlanResult,
	FlowMinimalSubmitResult,
} from "../../submit/minimal-submit.ts";
import { createFlowMinimalSubmitClient } from "../../submit/real-minimal-submit.ts";
import {
	commandOperations,
	withCommandOperations,
} from "../../phase-stream/matrix-progress-core.ts";
import {
	resolveSubmitProgress,
	type SubmitMatrixProgressController,
} from "../../submit/submit-matrix-progress.ts";
import { bindMatrixSubmitProgress } from "../../submit/submit-progress.ts";
import {
	flowSubmitHookFailureExitCode,
	formatFlowSubmitHookFailure,
	loadFlowSubmitHooks,
	runFlowSubmitHooks,
	type FlowSubmitHook,
} from "../../submit/submit-hooks.ts";
import {
	defineCommand,
	failure,
	ok,
	usageError,
	z,
	type CommandExit,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import { flowExtensionDescriptorSource } from "../extension.ts";
import { FLOW_COMMAND_FAILED, exitCodeToFlowCommandExit } from "../flow-cli-runner.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";

const SUBMIT_FAILURE_TRANSCRIPT_MAX_CHARS = 12_000;
const SUBMIT_FAILURE_LOG_DIR_ENV = "NS_SUBMIT_FAILURE_LOG_DIR";
interface SubmitCheckpointContext {
	repoRoot?: string;
	modelSelection: ModelSelection;
}

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
	checks: z
		.boolean()
		.default(true)
		.describe(
			'Run pre-submit checks installed at [points]."flow.submit.pre" in repo-root ns.toml before checkpointing. Use --no-checks to skip.',
		),
	regenerateDescriptions: z
		.boolean()
		.default(false)
		.describe(
			"Regenerate titles and ns-managed descriptions for all existing PRs, including PRs with non-empty bodies.",
		),
	minimal: z
		.boolean()
		.default(false)
		.describe(
			"Clean-tree cheap submit with no hooks, checkpoint, metadata preparation, PR prose, or model calls.",
		),
});

const SUBMIT_COMMAND_DESCRIPTION = `Run configured pre-submit checks, checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors with gt submit --no-edit --publish --no-stack --no-ai --no-interactive.

Use --minimal/-m for a clean-tree cheap submit: readiness, automatic restack when needed, current/downstack submission, and thin current-PR verification only. Minimal mode runs no configured hooks, checkpoint, metadata preparation, PR prose, or model calls.

Pre-submit checks are consumer config in the repo-root ns.toml ([points]."flow.submit.pre", an array of command strings such as ["just"]). Each entry is whitespace-split and executed directly without a shell; the first failing check aborts the submit. Skip them with --no-checks.

Environment:
  NS_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

  NS_SUBMIT_FAILURE_LOG_DIR     Optional directory for raw submit-failure transcripts.

By default, existing PRs with empty bodies receive generated titles and descriptions; existing PRs with non-empty bodies are left unchanged. Use --regenerate-descriptions to regenerate titles and ns-managed descriptions for every existing PR.

The command owns its output and exit code. It does not support --format.`;

type SubmitRequest = z.output<typeof submitSchema>;

export interface FlowSubmitCommandDependencies {
	createRuntime(ctx: NsExtensionApi): NsSubmitRuntime;
	createMinimalClient(ctx: NsExtensionApi): FlowMinimalSubmitClient;
}

export function createFlowSubmitCommand(
	dependencies: FlowSubmitCommandDependencies,
): NsCommand<typeof submitSchema> {
	return defineCommand({
		name: "submit",
		summary: "Checkpoint pending changes, then submit the Graphite stack with gt submit.",
		description: SUBMIT_COMMAND_DESCRIPTION,
		schema: submitSchema,
		resultSchema: z.string(),
		options: {
			restack: { short: "-R" },
			force: { short: "-f" },
			verbose: { short: "-v" },
			minimal: { short: "-m" },
		},
		handler: async (ctx: NsExtensionApi, request: SubmitRequest) => {
			if (request.minimal && request.regenerateDescriptions) {
				return usageError(
					"--minimal cannot be combined with --regenerate-descriptions because minimal submit never generates PR prose.",
					{ conflictingOptions: ["--minimal", "--regenerate-descriptions"] },
				);
			}
			if (request.minimal) {
				return await runMinimalSubmit({
					ctx,
					request,
					client: dependencies.createMinimalClient(ctx),
				});
			}
			const runtime = dependencies.createRuntime(ctx);
			const repoRoot = request.checks
				? await resolveFlowSubmitGitRepoRoot(runtime.git, ctx.cwd)
				: undefined;
			const checkpointModel = await resolveFlowModelSelection(
				ctx,
				MODEL_OPERATION_IDS.flowCheckpoint,
			);
			if (!checkpointModel.ok) return failure(FLOW_COMMAND_FAILED, checkpointModel.error);
			const prDescriptionModel = await resolveFlowModelSelection(
				ctx,
				MODEL_OPERATION_IDS.flowPrDescription,
			);
			if (!prDescriptionModel.ok) return failure(FLOW_COMMAND_FAILED, prDescriptionModel.error);
			const checkpointContext: SubmitCheckpointContext = {
				modelSelection: checkpointModel.modelSelection,
				...optionalEntry("repoRoot", repoRoot),
			};
			const checksLoad =
				repoRoot === undefined
					? { kind: "none" as const }
					: await loadFlowSubmitHooks({ repoRoot });
			if (checksLoad.kind === "invalid") {
				return failure(FLOW_COMMAND_FAILED, checksLoad.error.message);
			}
			const caps = resolveFlowStreamCaps(ctx);
			const structuredProgress = resolveSubmitProgress({
				caps,
				deps: flowStreamDeps(ctx, caps),
				hasChecks: checksLoad.kind === "hooks",
				...(ctx.progress.isLive ? { liveProgress: ctx.progress } : {}),
				...optionalEntry("liveOutput", createFlowLiveOutput(ctx)),
			});
			return await runSubmitWithProgress({
				ctx,
				request,
				runtime,
				checksLoad,
				checkpointContext,
				prDescriptionModelSelection: prDescriptionModel.modelSelection,
				...structuredProgress,
			});
		},
	});
}

export const flowSubmitCommand = createFlowSubmitCommand({
	createRuntime: (ctx) => createNsSubmitRuntime(ctx, flowExtensionDescriptorSource),
	createMinimalClient: (ctx) =>
		createFlowMinimalSubmitClient({ cwd: ctx.cwd, commands: ctx, env: ctx.env }),
});

export default flowSubmitCommand;

async function runMinimalSubmit(input: {
	ctx: NsExtensionApi;
	request: SubmitRequest;
	client: FlowMinimalSubmitClient;
}): Promise<CommandExit> {
	const liveOutput = createFlowLiveOutput(input.ctx);
	const planned = await input.client.planCurrentBranch();
	if (planned.type !== "tracked") return minimalPlanFailure(planned);

	emitFlowProgress(
		liveOutput,
		`minimal submit scope: ${planned.plan.affectedBranches.join(" → ")}`,
	);
	const result = await input.client.submitCurrentBranch({
		type: "planned",
		expectedPlan: planned.plan,
		restack: input.request.restack,
		force: input.request.force,
		onPhase: (event) => renderMinimalPhase(event, liveOutput),
		...(input.request.verbose
			? {
					onOutput: (event: { stream: "stdout" | "stderr"; text: string }) =>
						liveOutput?.(event.stream, event.text),
				}
			: {}),
	});
	if (result.type === "failed") return minimalSubmitFailure(result);
	return ok(
		`Submitted ${result.plan.affectedBranches.length} Graphite ${
			result.plan.affectedBranches.length === 1 ? "branch" : "branches"
		} with minimal submit. Current source: ${result.source.branch}@${result.source.headSha}.`,
	);
}

function minimalPlanFailure(result: Exclude<FlowMinimalSubmitPlanResult, { type: "tracked" }>) {
	if (result.type === "not-graphite-tracked") {
		return failure(
			FLOW_COMMAND_FAILED,
			`Minimal submit requires a Graphite-tracked current branch. ${result.message}`,
		);
	}
	return failure(FLOW_COMMAND_FAILED, formatMinimalFailure(result));
}

function minimalSubmitFailure(result: Extract<FlowMinimalSubmitResult, { type: "failed" }>) {
	return failure(FLOW_COMMAND_FAILED, formatMinimalFailure(result));
}

function formatMinimalFailure(result: {
	stage: string;
	error: { message: string; dirtyPaths?: readonly string[]; isDirtyPathsTruncated?: boolean };
	mutation: { local: string; remote: string };
}): string {
	const dirty =
		result.error.dirtyPaths === undefined
			? ""
			: `\nDirty paths: ${result.error.dirtyPaths.join(", ")}${
					result.error.isDirtyPathsTruncated === true ? ", …" : ""
				}`;
	return `${result.error.message}${dirty}\nStage: ${result.stage}. Mutation evidence: local ${result.mutation.local}; remote ${result.mutation.remote}.`;
}

function renderMinimalPhase(
	event: FlowMinimalSubmitPhaseEvent,
	liveOutput: FlowLiveOutput | undefined,
): void {
	if (event.status !== "started") return;
	const labels: Readonly<Record<FlowMinimalSubmitPhaseEvent["stage"], string>> = {
		planning: "rechecking minimal-submit source and Graphite scope…",
		readiness: "checking Graphite submit readiness…",
		restack: "running gt restack --downstack --no-interactive…",
		"readiness-recheck": "rechecking Graphite submit readiness after restack…",
		submit: "submitting current and downstack branches…",
		verification: "verifying the current PR and final source state…",
	};
	emitFlowProgress(liveOutput, labels[event.stage]);
}

async function resolveFlowSubmitGitRepoRoot(
	git: Pick<GitGateway, "optionalRepoRoot">,
	cwd: string,
): Promise<string | undefined> {
	const result = await git.optionalRepoRoot({ cwd });
	return result.type === "found" ? result.value : undefined;
}

function checkProgressLabel(input: {
	check: FlowSubmitHook;
	index: number;
	total: number;
}): string {
	return input.total === 1
		? `running ${input.check.display}…`
		: `running ${input.check.display} (${input.index + 1}/${input.total})…`;
}

async function runSubmitWithProgress(input: {
	ctx: NsExtensionApi;
	request: SubmitRequest;
	runtime: NsSubmitRuntime;
	checksLoad: Awaited<ReturnType<typeof loadFlowSubmitHooks>>;
	checkpointContext: SubmitCheckpointContext;
	prDescriptionModelSelection: ModelSelection;
	matrix: SubmitMatrixProgressController;
	onOutput?: FlowLiveOutput;
}) {
	const {
		ctx,
		request,
		runtime,
		checksLoad,
		checkpointContext,
		prDescriptionModelSelection,
		matrix,
		onOutput,
	} = input;
	matrix.begin();

	try {
		if (checksLoad.kind === "hooks") {
			matrix.phase({ type: "phase-started", phaseKey: "checks" });
			const checksOutcome = await withCommandOperations(matrix, [], () =>
				runFlowSubmitHooks({
					hooks: checksLoad.hooks,
					runner: runtime.commandRunner,
					onHookStarted: ({ hook: check, index, total }) => {
						matrix.setActiveOperations(commandOperations([check.display]));
						matrix.phase({
							type: "phase-progress",
							phaseKey: "checks",
							label: checkProgressLabel({ check, index, total }),
						});
					},
					...(onOutput === undefined ? {} : { onOutput }),
				}),
			);
			if (checksOutcome.kind === "failed") {
				return await matrixPhaseFailureResult(ctx, matrix, {
					key: "checks",
					failedText: "checks failed",
					stderr: formatFlowSubmitHookFailure(checksOutcome),
					exitCode: flowSubmitHookFailureExitCode(checksOutcome),
					failurePresentation: "deterministic",
				});
			}
			matrix.phase({ type: "phase-done", phaseKey: "checks", detail: "checks complete" });
		}
		const checkpointRunContext = runtime.createCheckpointRunContext(matrix.setActiveOperations);
		matrix.phase({ type: "phase-started", phaseKey: "checkpoint" });
		const checkpoint = await runCheckpointIfPending({
			cwd: ctx.cwd,
			env: ctx.env,
			...checkpointRunContext,
			...checkpointContext,
			textGenerator: ctx.textGenerator,
			modelSelection: checkpointContext.modelSelection,
			onPhase: matrix.phase,
		});
		if (checkpoint.kind === "failed") {
			return await matrixPhaseFailureResult(ctx, matrix, {
				key: "checkpoint",
				failedText: "checkpoint failed",
				stderr: formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr),
				exitCode: checkpoint.output.exitCode,
				...optionalEntry("failurePresentation", checkpoint.failurePresentation),
			});
		}
		matrix.phase({ type: "phase-done", phaseKey: "checkpoint", detail: "checkpoint complete" });

		const progress = bindMatrixSubmitProgress({ matrix });
		const result = await runSubmitCommand({
			cwd: ctx.cwd,
			gateway: runtime.submitGateway,
			metadataGateway: runtime.metadataGateway,
			restack: request.restack,
			force: request.force,
			shouldForwardCommandOutput: request.verbose,
			prDescription: { ...runtime.prDescription, modelSelection: prDescriptionModelSelection },
			shouldRegenerateExistingPrDescriptions: request.regenerateDescriptions,
			progress,
			...(onOutput === undefined ? {} : { onOutput }),
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
		return isFailed ? submitFailureExit(interpretedResult) : ok("");
	} finally {
		await matrix.stop();
	}
}

async function matrixPhaseFailureResult(
	ctx: NsExtensionApi,
	matrix: SubmitMatrixProgressController,
	failure: {
		key: "checks" | "checkpoint";
		failedText: string;
		stderr: string;
		exitCode: number;
		failurePresentation?: SubmitCommandResult["failurePresentation"];
	},
): Promise<CommandExit> {
	matrix.phase({ type: "phase-failed", phaseKey: failure.key, detail: failure.failedText });
	const interpreted = await maybeFormatSubmitFailureWithModel(
		{
			stdout: "",
			stderr: failure.stderr,
			exitCode: failure.exitCode,
			...optionalEntry("failurePresentation", failure.failurePresentation),
		},
		ctx,
	);
	await matrix.finish({ isFailed: true });
	return submitFailureExit(interpreted);
}

function submitFailureExit(result: SubmitCommandResult): CommandExit {
	return exitCodeToFlowCommandExit(result.exitCode, resultFailureMessage(result));
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
	const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowSubmitFailure);
	if (!model.ok)
		return { ...result, stderr: formatFailureWithRawLog({ stderr: model.error, rawLog }) };
	const interpretation = await generateSubmitFailureInterpretation({
		rawTranscript,
		exitCode: result.exitCode,
		ctx,
		modelSelection: model.modelSelection,
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
	modelSelection: ModelSelection;
}): Promise<{ ok: true; text: string } | { ok: false }> {
	try {
		const interpretation = await input.ctx.textGenerator.generateText({
			modelSelection: input.modelSelection,
			operation: "submit-failure",
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
			`termination: ${command.termination}`,
			`exit code: ${command.exitCode === null ? "unavailable" : command.exitCode}`,
		);
		if (command.signal !== undefined) {
			lines.push(`signal: ${command.signal ?? "none"}`);
		}
		if (command.error !== undefined) lines.push(`spawn error: ${command.error}`);
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

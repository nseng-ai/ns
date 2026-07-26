import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI as PiExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { z as ZodNamespace } from "zod";

// Provisional consumer artifact (docs/platform-and-consumer.md): a vibecoded Pi tool for the
// objective-autorun skill. The canonical `/ns:objective:autorun` command lives in
// `@nseng-ai/objectives/pi`; this local extension only registers the `objective_runner_step` tool,
// which mechanically wraps ONE runner step (runner-begin → implementation subagent with live widget
// → runner-finish) and returns the Runner Checkpoint for the parent to judge. Judgment stays in the
// parent LLM per ADR 0040/0024.
//
// Promotion path, once the flow proves itself in real Pi runs: lift this tool into a new
// `@internal/pi-tools` subpackage beside thermo-council (package.json `exports` + `ns.subpackages` +
// `.pi/lib/workspace-packages.ts` fallback map + parity test).
//
// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry. Static imports
// mostly reach into the ts workspace by relative path; ns-pi-subagents is consumed exclusively through
// its `/api` surface, resolved through .pi/lib/workspace-packages.ts so the direct Node import smoke works.
import { OBJECTIVE_RUNNER_CHILD_FORBIDDEN_ACTIONS_RULE } from "../../ts/packages/incubating/extensions/objectives/src/core/objective-runner-rules.ts";
import { parseMachineEnvelopeData } from "../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/runtime/machine-envelope.ts";
import type {
	ToolContext,
	ToolDefinition,
	ToolResult,
} from "../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/runtime/tool-types.ts";
import type {
	RunnerSubagentResult,
	RunnerSubagentUpdate,
	SingleSubagentFleetRunTracking,
	SubagentFleetRegistry,
} from "@internal/ns-pi-subagents/api";
import type { RawPiExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import {
	formatZodError,
	isRecord,
	optionalEntries,
	optionalEntry,
} from "../../ts/packages/public/infra/foundation/src/primitives/primitives.ts";
import { tailText, type ExecResult } from "../../ts/packages/public/infra/foundation/src/exec/index.ts";

// Bare "zod" is not resolvable from .pi/extensions (no node_modules ancestry at the repo root);
// resolve it through the ts workspace package that declares it, matching .pi/lib/workspace-packages.ts.
const requireFromPiTools = createRequire(
	new URL("../../ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/package.json", import.meta.url),
);
const { z } = requireFromPiTools("zod") as typeof import("zod");
const {
	dispatchRunnerSubagent,
	formatRunnerSubagentActivityWidgetLines,
	resolveSameProviderCheapModel,
	getOrCreateSubagentFleetRegistry,
	setRunnerSubagentWidget,
	trackSingleSubagentFleetRun,
} = await importTypeScriptWorkspaceModule<typeof import("@internal/ns-pi-subagents/api")>(
	"@internal/ns-pi-subagents/api",
);
const { createPiCommandExecApi } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/pi-runtime/shared/command-exec")
>("@nseng-ai/pi-runtime/shared/command-exec");

const TOOL_NAME = "objective_runner_step";
const WIDGET_KEY = "objective-runner-step";
const SCRATCH_ROOT_PREFIX = "objective-runner-step";
const MAX_FAILURE_TAIL_CHARS = 8_000;

type RunnerStepPhase = "begin" | "subagent" | "finish";

interface RunObjectiveRunnerStepOptions {
	readonly pi: ExtensionAPI;
	readonly fleetRegistry: SubagentFleetRegistry;
	readonly params: unknown;
	readonly signal: AbortSignal | undefined;
	readonly ctx: ToolContext;
}

interface RunnerScratchPaths {
	readonly reportPath: string;
	readonly factsPath: string;
}

interface StepToolResultOptions {
	readonly text: string;
	readonly phase: RunnerStepPhase;
	readonly details?: Record<string, unknown>;
	readonly subagent?: RunnerSubagentResult;
}

interface DiagnosticFailureTextOptions {
	readonly header: string;
	readonly message: string | undefined;
	readonly sections: readonly DiagnosticTailSection[];
}

interface DiagnosticTailSection {
	readonly label: string;
	readonly text: string;
	readonly omitIfEmpty?: boolean;
}

interface ExtensionAPI extends RawPiExecApi {
	readonly events: PiExtensionAPI["events"];
	readonly on: PiExtensionAPI["on"];
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
}

const objectiveRunnerStepInputSchema = z
	.object({
		objective: z
			.string()
			.trim()
			.min(1)
			.describe("Objective slug to run one decomposed runner step for."),
		guidance: z
			.string()
			.trim()
			.min(1)
			.describe(
				"Thin, judgment-bearing parent guidance for this step: which slice to take, what the last step left behind, what to avoid. Woven verbatim into the subagent prompt.",
			),
		recover: z
			.boolean()
			.optional()
			.describe(
				"Re-dispatch in recover mode after a failed step: the subagent repairs the dirty tree the failed step left behind instead of starting a fresh slice.",
			),
		routing: z
			.enum(["cheap"])
			.optional()
			.describe(
				"Optional upfront same-provider cheap routing intent. Omission inherits the parent provider, model, and thinking policy; a launch failure does not authorize rerouting.",
			),
		title: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe("Optional display label for the live progress widget."),
	})
	.strict();

type ObjectiveRunnerStepInput = ZodNamespace.infer<typeof objectiveRunnerStepInputSchema>;

const OBJECTIVE_RUNNER_STEP_PARAMETERS = z.toJSONSchema(objectiveRunnerStepInputSchema, {
	io: "input",
}) satisfies Record<string, unknown>;

/** Per-slug step counter for widget display; fresh scratch paths never depend on it. */
const stepCountsBySlug = new Map<string, number>();

export default function objectiveAutorunExtension(pi: ExtensionAPI): void {
	const fleetRegistry = getOrCreateSubagentFleetRegistry({
		owner: pi.events,
		onSessionStart: (handler) => pi.on("session_start", handler),
		onSessionShutdown: (handler) => pi.on("session_shutdown", handler),
	});
	pi.registerTool({
		name: TOOL_NAME,
		label: "Objective runner step",
		description: `Run ONE local-only Objective Runner step mechanically: runner-begin, dispatch the implementation subagent with the generated prompt (live progress widget), runner-finish. Omitted routing inherits the parent provider, model, and thinking policy; routing: cheap selects only an approved model within the same provider before dispatch, and launch failure never authorizes rerouting. Returns the Runner Checkpoint markdown for the parent to judge; owns fresh report/facts scratch paths per call. This tool has no publication input or authority. The parent reads the checkpoint, then separately decides continue / recover (call again with recover: true) / stop and any conditionally authorized post-checkpoint action. Canonical child/step prohibition: ${OBJECTIVE_RUNNER_CHILD_FORBIDDEN_ACTIONS_RULE}`,
		parameters: OBJECTIVE_RUNNER_STEP_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			runObjectiveRunnerStep({ pi, fleetRegistry, params, signal, ctx }),
	});
}

async function runObjectiveRunnerStep(options: RunObjectiveRunnerStepOptions): Promise<ToolResult> {
	const { pi, fleetRegistry, params, signal, ctx } = options;
	const parsedInput = objectiveRunnerStepInputSchema.safeParse(params);
	if (!parsedInput.success) throw new Error(formatZodError(parsedInput.error));
	const input: ObjectiveRunnerStepInput = parsedInput.data;
	const slug = input.objective;
	const shouldRecover = input.recover === true;
	const commands = createPiCommandExecApi(pi);

	const stepNumber = (stepCountsBySlug.get(slug) ?? 0) + 1;
	stepCountsBySlug.set(slug, stepNumber);
	let fleetTracking: SingleSubagentFleetRunTracking | undefined;

	// Scratch dir per runner-subagents convention: fresh per call, so every attempt — including
	// every recovery attempt — automatically satisfies runner-begin's fresh-report-path rule.
	const scratchRoot = join(tmpdir(), SCRATCH_ROOT_PREFIX);
	await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
	const stepDir = await mkdtemp(join(scratchRoot, "step-"));
	await chmod(stepDir, 0o700);
	const guidancePath = join(stepDir, "guidance.md");
	const scratchPaths = {
		reportPath: join(stepDir, "report.json"),
		factsPath: join(stepDir, "facts.json"),
	} satisfies RunnerScratchPaths;

	const pushWidget = (phase: RunnerStepPhase, update?: RunnerSubagentUpdate): void => {
		const lines = [`objective ${slug} · step ${stepNumber} · ${phase}`];
		if (update !== undefined) lines.push(...formatRunnerSubagentActivityWidgetLines(update));
		setRunnerSubagentWidget(ctx, WIDGET_KEY, lines);
	};

	function stepToolResult(options: StepToolResultOptions): ToolResult {
		const { text, phase, details = {}, subagent } = options;
		return {
			content: [{ type: "text", text }],
			details: {
				...details,
				phase,
				...scratchPaths,
				...optionalEntry(
					"subagent",
					subagent === undefined ? undefined : subagentDetails(subagent),
				),
			},
		};
	}

	try {
		await writeFile(guidancePath, input.guidance, { encoding: "utf8", mode: 0o600 });
		pushWidget("begin");
		const beginExec = await commands.exec(
			"ns",
			[
				"objective",
				"exec",
				"runner-begin",
				slug,
				...(shouldRecover ? ["--recover"] : []),
				"--guidance",
				`@${guidancePath}`,
				"--report-path",
				scratchPaths.reportPath,
				"--format",
				"json",
			],
			{ cwd: ctx.cwd },
		);
		await writeFile(scratchPaths.factsPath, beginExec.stdout, { encoding: "utf8", mode: 0o600 });

		const beginParsed = parseMachineEnvelopeData(beginExec.stdout, {
			label: "runner-begin envelope",
			stdoutTail: { maxChars: MAX_FAILURE_TAIL_CHARS },
		});
		if (beginParsed.type !== "valid" || beginExec.code !== 0) {
			return beginFailureResult(
				beginExec,
				beginParsed.type === "valid" ? undefined : beginParsed.message,
			);
		}
		const prompt = beginParsed.data.prompt;
		if (typeof prompt !== "string" || prompt.length === 0) {
			return beginFailureResult(beginExec, "runner-begin envelope carried no subagent prompt.");
		}

		const subagentTitle = input.title ?? `objective ${slug} step ${stepNumber}`;
		fleetTracking = trackSingleSubagentFleetRun({
			registry: fleetRegistry,
			ctx,
			title: subagentTitle,
			prompt,
			parentSessionFile: ctx.sessionManager?.getSessionFile?.(),
		});

		pushWidget("subagent");
		fleetTracking.onStart();
		const selectedModel =
			input.routing === "cheap" ? resolveSameProviderCheapModel(ctx.model) : undefined;
		const subagent = await dispatchRunnerSubagent(
			pi,
			{ cwd: ctx.cwd, ...optionalEntry("signal", signal) },
			{
				title: subagentTitle,
				prompt,
				returnMode: "final-text",
				...optionalEntry("model", selectedModel),
				onProgress: (update) => {
					pushWidget("subagent", update);
					fleetTracking?.onProgress(update);
				},
			},
		);
		fleetTracking.onDone(subagent);
		if (subagent.status === "cancelled" || signal?.aborted === true) {
			return stepToolResult({
				text: `Runner step cancelled between runner-begin and runner-finish for objective ${slug}. runner-finish was NOT run, so no checkpoint was judged and the worktree may hold uncommitted subagent changes. Inspect the worktree, then recover by calling ${TOOL_NAME} again with recover: true and sharpened guidance.`,
				phase: "subagent",
				subagent,
			});
		}

		// Every non-cancelled outcome proceeds to finish — the report file, not the final text, is
		// the contract; finish itself yields a malfunction checkpoint if the report is missing.
		pushWidget("finish");
		const finishExec = await commands.exec(
			"ns",
			[
				"objective",
				"exec",
				"runner-finish",
				slug,
				"--facts",
				`@${scratchPaths.factsPath}`,
				"--format",
				"json",
			],
			{ cwd: ctx.cwd },
		);
		const checkpoint = extractCheckpointData(finishExec.stdout);
		if (checkpoint === undefined) {
			return stepToolResult({
				text: formatDiagnosticFailureText({
					header: `runner-finish produced no parseable checkpoint envelope for objective ${slug} (exit ${finishExec.code}). Treat this as a malfunction: read the diagnostics below and check the worktree before anything else.`,
					message: undefined,
					sections: [
						{ label: "stdout", text: finishExec.stdout },
						{ label: "stderr", text: finishExec.stderr },
					],
				}),
				phase: "finish",
				details: { exitCode: finishExec.code },
				subagent,
			});
		}

		return stepToolResult({
			text: checkpoint.checkpointMarkdown,
			phase: "finish",
			details: {
				exitCode: finishExec.code,
				status: checkpoint.data.status,
				mode: checkpoint.data.mode,
				baseBranch: checkpoint.data.baseBranch,
				branch: checkpoint.data.branch,
				commitSha: checkpoint.data.commitSha,
				changedPaths: checkpoint.data.changedPaths,
				gateChecks: checkpoint.data.gateChecks,
				stopReason: checkpoint.data.stopReason,
			},
			subagent,
		});
	} finally {
		fleetTracking?.dispose();
		setRunnerSubagentWidget(ctx, WIDGET_KEY, undefined);
		await rm(stepDir, { recursive: true, force: true });
	}

	function beginFailureResult(exec: ExecResult, envelopeMessage: string | undefined): ToolResult {
		return stepToolResult({
			text: formatDiagnosticFailureText({
				header: `runner-begin refused or failed for objective ${slug} (exit ${exec.code}). Nothing was dispatched; the parent decides the next move.`,
				message: envelopeMessage,
				sections: [{ label: "stderr", text: exec.stderr, omitIfEmpty: true }],
			}),
			phase: "begin",
			details: { exitCode: exec.code },
		});
	}
}

function formatDiagnosticFailureText(options: DiagnosticFailureTextOptions): string {
	const lines = [options.header];
	if (options.message !== undefined) lines.push("", options.message);
	for (const section of options.sections) {
		const sectionTail = tailText(section.text, { maxChars: MAX_FAILURE_TAIL_CHARS });
		if (section.omitIfEmpty === true && sectionTail.length === 0) continue;
		lines.push("", `${section.label} tail:`, sectionTail);
	}
	return lines.join("\n");
}

interface CheckpointEnvelopeData {
	data: Record<string, unknown>;
	checkpointMarkdown: string;
}

/**
 * runner-finish carries the checkpoint inside `data` for every judged status regardless of exit
 * code (committed/stop → 0, blocked/verification-failed → 1, malfunction → 2), so parse the raw
 * envelope instead of an ok-only helper.
 */
function extractCheckpointData(stdout: string): CheckpointEnvelopeData | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isRecord(parsed.data)) return undefined;
	const checkpointMarkdown = parsed.data.checkpointMarkdown;
	if (typeof checkpointMarkdown !== "string" || checkpointMarkdown.length === 0) return undefined;
	return { data: parsed.data, checkpointMarkdown };
}

function subagentDetails(result: RunnerSubagentResult): Record<string, unknown> {
	const sessionFile = result.sessionFile ?? result.progress.sessionFile;
	return {
		status: result.status,
		...optionalEntries({ sessionFile, usage: result.usage }),
	};
}

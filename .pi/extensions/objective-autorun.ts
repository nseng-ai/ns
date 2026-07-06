import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z as ZodNamespace } from "zod";

// Provisional consumer artifact (docs/platform-and-consumer.md): a vibecoded Pi surface for the
// objective-autorun skill — the `/ns:objective:autorun` command expands the repo skill and hands the
// loop to the session agent, and the `objective_runner_step` tool mechanically wraps ONE runner
// step (runner-begin → implementation subagent with live widget → runner-finish) and returns the
// Runner Checkpoint for the parent to judge. Judgment stays in the parent LLM per ADR 0022/0024.
//
// Promotion path, once the flow proves itself in real Pi runs:
// (a) command → an `@nseng-ai/objectives/pi` command spec (`objectiveCommandSpecs` in
//     ts/packages/capabilities/objectives/src/core/objective-command-specs.ts) with an auto parity
//     table entry;
// (b) tool → a new `@internal/pi-tools` subpackage beside thermo-council (package.json `exports`
//     + `ns.subpackages` + `.pi/lib/workspace-packages.ts` fallback map + parity test).
//
// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry. Match the
// rest of .pi/extensions and reach into the ts workspace by relative path instead of bare specifier.
import { nsCommandSurface } from "../../ts/packages/infra/foundation/src/primitives/command.ts";
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "../../ts/packages/hosts/pi/src/commands/ack.ts";
import { expandRepoSkillBlock } from "../../ts/packages/hosts/pi/src/kit/skills/expansion.ts";
import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
	type ObjectiveSelectionSpec,
} from "../../ts/packages/capabilities/objectives/src/api/index.ts";
import { OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE } from "../../ts/packages/capabilities/objectives/src/runner/prompt.ts";
import { parseMachineEnvelopeData } from "../../ts/packages/hosts/pi/src/runtime/machine-envelope.ts";
import type {
	ToolContext,
	ToolDefinition,
	ToolResult,
} from "../../ts/packages/hosts/pi/src/runtime/tool-types.ts";
import {
	dispatchRunnerSubagent,
	isRecord,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../../ts/packages/extensions/ns-pi-subagents/src/runner-subagents/index.ts";
import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
} from "../../ts/packages/extensions/ns-pi-subagents/src/runner-subagents/widget.ts";
import {
	buildFencedTextBlock,
	formatZodError,
	optionalEntries,
	optionalEntry,
} from "../../ts/packages/infra/foundation/src/primitives/primitives.ts";
import {
	piExecApiToCommandExecApi,
	tailText,
	type ExecResult,
	type PiExecResultLike,
} from "../../ts/packages/infra/foundation/src/exec/index.ts";

// Bare "zod" is not resolvable from .pi/extensions (no node_modules ancestry at the repo root);
// resolve it through the ts workspace package that declares it, matching .pi/lib/workspace-packages.ts.
const requireFromPiTools = createRequire(
	new URL("../../ts/packages/extensions/ns-pi-subagents/package.json", import.meta.url),
);
const { z } = requireFromPiTools("zod") as typeof import("zod");

const COMMAND_NAME = nsCommandSurface("objective", "autorun");
const TOOL_NAME = "objective_runner_step";
const WIDGET_KEY = "objective-runner-step";
const SKILL_NAME = "objective-autorun";
const SCRATCH_ROOT_PREFIX = "objective-runner-step";
const MAX_FAILURE_TAIL_CHARS = 8_000;
const OBJECTIVE_AUTORUN_SELECTION_SPEC = {
	statusKey: COMMAND_NAME,
	selectionTitle: "Select an active Objective for autorun",
	shouldCompactDiffSuggestion: true,
} satisfies ObjectiveSelectionSpec;

type NotifyLevel = "info" | "warning" | "error";
type RunnerStepPhase = "begin" | "subagent" | "finish";

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		select?(title: string, options: string[]): Promise<string | undefined>;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

interface RunObjectiveRunnerStepOptions {
	readonly pi: ExtensionAPI;
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

interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<PiExecResultLike>;
	sendUserMessage(content: string): Promise<void> | void;
}

const PI_ADDENDUM = `### Pi session addendum — objective_runner_step tool

In this session, run each runner step by calling the \`objective_runner_step\` tool with \`{ objective, guidance, recover?, model? }\` instead of hand-running \`ns objective exec runner-begin\`, dispatching a subagent yourself, and \`ns objective exec runner-finish\`. The tool owns the mechanical step: it runs runner-begin, dispatches the implementation subagent with the generated prompt (progress renders in a live widget), runs runner-finish, and returns the Runner Checkpoint markdown as its result. It also owns report/facts scratch paths — skip the skill's step-artifact bookkeeping; every call gets fresh paths automatically, including recovery attempts.

Everything else in the objective-autorun skill still binds you: derive thin, judgment-bearing guidance per step, read every checkpoint and make an explicit continue/recover/stop decision, record Semantic Updates via the objective-update skill between steps, and honor all stop conditions and hard boundaries. Canonical forbidden-action rule from \`ts/packages/capabilities/objectives/src/runner/prompt.ts\`: "${OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE}". Never commit on trunk; later push/submit/handoff decisions belong outside the runner and require separate human direction. To recover a failed step, call the tool again with \`recover: true\` and sharpened guidance. Never mutate the worktree while a tool call is running.`;

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
		model: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe(
				"Optional fully-qualified provider/model override for the implementation subagent.",
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
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Pick an Objective when needed, then run the objective-autorun parent loop in this session with runner steps wrapped by the objective_runner_step tool.",
			argumentHint: "[objective-slug] [scope / step budget / standing guidance]",
			handler: async (args, ctx) => runAutorunCommand(pi, args, ctx),
		},
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "Objective runner step",
		description: `Run ONE Objective Runner step mechanically: runner-begin, dispatch the implementation subagent with the generated prompt (live progress widget), runner-finish. Returns the Runner Checkpoint markdown for the parent to judge; owns fresh report/facts scratch paths per call. The parent keeps all judgment: read the checkpoint, then decide continue / recover (call again with recover: true) / stop. Runner runs are local-only and obey the canonical forbidden-action rule: ${OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE}`,
		parameters: OBJECTIVE_RUNNER_STEP_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			runObjectiveRunnerStep({ pi, params, signal, ctx }),
	});
}

async function runAutorunCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const explicitArgs = args.trim();
	const selectedArgs =
		explicitArgs.length === 0 ? await chooseAutorunObjective(pi, ctx) : explicitArgs;
	if (selectedArgs === undefined) return;

	let skillBlock: string;
	try {
		const skill = await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME });
		skillBlock = skill.block;
	} catch {
		skillBlock = `The repo ${SKILL_NAME} skill (skills/${SKILL_NAME}/SKILL.md) could not be expanded inline; read it from the repo and follow it as the loop contract before proceeding.`;
		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message: `Could not expand the ${SKILL_NAME} skill; sending a fallback pointer instead.`,
			delivery: "notify",
			level: "warning",
		});
	}

	const prompt = [
		skillBlock,
		"The fenced block below is the user's explicit Objective selection and launch scope for this run (slug plus optional scope, step budget, and standing guidance):",
		buildFencedTextBlock(selectedArgs),
		PI_ADDENDUM,
	].join("\n\n");

	await ctx.waitForIdle();
	await pi.sendUserMessage(prompt);
}

async function chooseAutorunObjective(
	pi: ExtensionAPI,
	ctx: CommandContext,
): Promise<string | undefined> {
	const slug = await chooseActiveObjectiveSlug(
		piExecApiToCommandExecApi(pi),
		objectiveSelectionContextFromCommandContext(ctx),
		OBJECTIVE_AUTORUN_SELECTION_SPEC,
	);
	if (slug === undefined) return undefined;
	return slug;
}

async function runObjectiveRunnerStep(options: RunObjectiveRunnerStepOptions): Promise<ToolResult> {
	const { pi, params, signal, ctx } = options;
	const parsedInput = objectiveRunnerStepInputSchema.safeParse(params);
	if (!parsedInput.success) throw new Error(formatZodError(parsedInput.error));
	const input: ObjectiveRunnerStepInput = parsedInput.data;
	const slug = input.objective;
	const shouldRecover = input.recover === true;
	const commands = piExecApiToCommandExecApi(pi);

	const stepNumber = (stepCountsBySlug.get(slug) ?? 0) + 1;
	stepCountsBySlug.set(slug, stepNumber);

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

		pushWidget("subagent");
		const subagent = await dispatchRunnerSubagent(
			pi,
			{ cwd: ctx.cwd, ...optionalEntry("signal", signal) },
			{
				title: input.title ?? `objective ${slug} step ${stepNumber}`,
				prompt,
				returnMode: "final-text",
				...optionalEntry("model", input.model),
				onProgress: (update) => pushWidget("subagent", update),
			},
		);
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

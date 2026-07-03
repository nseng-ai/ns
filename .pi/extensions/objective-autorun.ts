import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Provisional consumer artifact (docs/platform-and-consumer.md): a vibecoded Pi surface for the
// objective-autorun skill — the `/objective:autorun` command expands the repo skill and hands the
// loop to the session agent, and the `objective_runner_step` tool mechanically wraps ONE runner
// step (runner-begin → implementation subagent with live widget → runner-finish) and returns the
// Runner Checkpoint for the parent to judge. Judgment stays in the parent LLM per ADR 0022/0024.
//
// Promotion path, once the flow proves itself in real Pi runs:
// (a) command → an `@sdl/objective/pi` command spec (`objectiveCommandSpecs` in
//     ts/packages/capabilities/objective/src/core/objective-command-specs.ts) with an auto parity
//     table entry;
// (b) tool → a new `@sdl-local/pi-tools` subpackage beside thermo-council (package.json `exports`
//     + `sdl.subpackages` + `.pi/lib/workspace-packages.ts` fallback map + parity test).
//
// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry. Match the
// rest of .pi/extensions and reach into the ts workspace by relative path instead of bare specifier.
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "../../ts/packages/hosts/pi/src/commands/ack.ts";
import {
	buildFencedTextBlock,
	expandRepoSkillBlock,
} from "../../ts/packages/hosts/pi/src/kit/skills/expansion.ts";
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
} from "../../ts/packages/local/pi-tools/src/runner-subagents/index.ts";
import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
} from "../../ts/packages/local/pi-tools/src/runner-subagents/widget.ts";
import { formatZodError } from "../../ts/packages/infra/core/src/primitives/primitives.ts";
import {
	normalizeExecResult,
	tailText,
	type ExecResult,
	type PiExecResultLike,
} from "../../ts/packages/infra/core/src/exec/index.ts";

// Bare "zod" is not resolvable from .pi/extensions (no node_modules ancestry at the repo root);
// resolve it through the ts workspace package that declares it, matching .pi/lib/workspace-packages.ts.
const requireFromPiTools = createRequire(
	new URL("../../ts/packages/local/pi-tools/package.json", import.meta.url),
);
const { z } = requireFromPiTools("zod") as typeof import("zod");

const COMMAND_NAME = "objective:autorun";
const TOOL_NAME = "objective_runner_step";
const WIDGET_KEY = "objective-runner-step";
const SKILL_NAME = "objective-autorun";
const SCRATCH_ROOT_PREFIX = "objective-runner-step";
const MAX_FAILURE_TAIL_CHARS = 8_000;

type NotifyLevel = "info" | "warning" | "error";

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
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
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike>;
	sendUserMessage(content: string): Promise<void> | void;
}

const PI_ADDENDUM = `### Pi session addendum — objective_runner_step tool

In this session, run each runner step by calling the \`objective_runner_step\` tool with \`{ objective, guidance, recover?, model? }\` instead of hand-running \`sdl objective exec runner-begin\`, dispatching a subagent yourself, and \`sdl objective exec runner-finish\`. The tool owns the mechanical step: it runs runner-begin, dispatches the implementation subagent with the generated prompt (progress renders in a live widget), runs runner-finish, and returns the Runner Checkpoint markdown as its result. It also owns report/facts scratch paths — skip the skill's step-artifact bookkeeping; every call gets fresh paths automatically, including recovery attempts.

Everything else in the objective-autorun skill still binds you: derive thin, judgment-bearing guidance per step, read every checkpoint and make an explicit continue/recover/stop decision, record Semantic Updates via the objective-update skill between steps, and honor all stop conditions and hard boundaries (never push/submit/land; never commit on trunk). To recover a failed step, call the tool again with \`recover: true\` and sharpened guidance. Never mutate the worktree while a tool call is running.`;

const objectiveRunnerStepInputSchema = z.object({
	objective: z.string().trim().min(1),
	guidance: z.string().trim().min(1),
	recover: z.boolean().optional(),
	model: z.string().trim().min(1).optional(),
	title: z.string().trim().min(1).optional(),
});

// Hand-written mirror of the zod schema: `z` is a require()-bound value here, so the
// `z.infer` type namespace is not available.
interface ObjectiveRunnerStepInput {
	objective: string;
	guidance: string;
	recover?: boolean;
	model?: string;
	title?: string;
}

const OBJECTIVE_RUNNER_STEP_PARAMETERS = {
	type: "object",
	properties: {
		objective: {
			type: "string",
			description: "Objective slug to run one decomposed runner step for.",
		},
		guidance: {
			type: "string",
			description:
				"Thin, judgment-bearing parent guidance for this step: which slice to take, what the last step left behind, what to avoid. Woven verbatim into the subagent prompt.",
		},
		recover: {
			type: "boolean",
			description:
				"Re-dispatch in recover mode after a failed step: the subagent repairs the dirty tree the failed step left behind instead of starting a fresh slice.",
		},
		model: {
			type: "string",
			description:
				"Optional fully-qualified provider/model override for the implementation subagent.",
		},
		title: {
			type: "string",
			description: "Optional display label for the live progress widget.",
		},
	},
	required: ["objective", "guidance"],
	additionalProperties: false,
} as const;

/** Per-slug step counter for widget display; fresh scratch paths never depend on it. */
const stepCountsBySlug = new Map<string, number>();

export default function objectiveAutorunExtension(pi: ExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Run the objective-autorun parent loop in this session, with runner steps wrapped by the objective_runner_step tool.",
			argumentHint: "<objective-slug> [scope / step budget / standing guidance]",
			handler: async (args, ctx) => runAutorunCommand(pi, args, ctx),
		},
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "Objective runner step",
		description:
			"Run ONE Objective Runner step mechanically: runner-begin, dispatch the implementation subagent with the generated prompt (live progress widget), runner-finish. Returns the Runner Checkpoint markdown for the parent to judge; owns fresh report/facts scratch paths per call. The parent keeps all judgment: read the checkpoint, then decide continue / recover (call again with recover: true) / stop.",
		parameters: OBJECTIVE_RUNNER_STEP_PARAMETERS,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			runObjectiveRunnerStep(pi, params, signal, ctx),
	});
}

async function runAutorunCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	const trimmedArgs = args.trim();
	if (trimmedArgs.length === 0) {
		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message:
				"Usage: /objective:autorun <objective-slug> [scope / step budget / standing guidance]. Run /objective:list to find slugs.",
			delivery: "notify",
			level: "error",
		});
		return;
	}

	let skillBlock: string;
	try {
		const skill = await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME });
		skillBlock = skill.block;
	} catch {
		skillBlock =
			`The repo ${SKILL_NAME} skill (skills/${SKILL_NAME}/SKILL.md) could not be expanded inline; read it from the repo and follow it as the loop contract before proceeding.`;
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
		buildFencedTextBlock(trimmedArgs),
		PI_ADDENDUM,
	].join("\n\n");

	await ctx.waitForIdle();
	await pi.sendUserMessage(prompt);
}

async function runObjectiveRunnerStep(
	pi: ExtensionAPI,
	params: unknown,
	signal: AbortSignal | undefined,
	ctx: ToolContext,
): Promise<ToolResult> {
	const parsedInput = objectiveRunnerStepInputSchema.safeParse(params);
	if (!parsedInput.success) throw new Error(formatZodError(parsedInput.error));
	const input = parsedInput.data as ObjectiveRunnerStepInput;
	const slug = input.objective;

	const stepNumber = (stepCountsBySlug.get(slug) ?? 0) + 1;
	stepCountsBySlug.set(slug, stepNumber);

	// Scratch dir per runner-subagents convention: fresh per call, so every attempt — including
	// every recovery attempt — automatically satisfies runner-begin's fresh-report-path rule.
	const scratchRoot = join(tmpdir(), SCRATCH_ROOT_PREFIX);
	await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
	const stepDir = await mkdtemp(join(scratchRoot, "step-"));
	await chmod(stepDir, 0o700);
	const guidancePath = join(stepDir, "guidance.md");
	const reportPath = join(stepDir, "report.json");
	const factsPath = join(stepDir, "facts.json");
	await writeFile(guidancePath, input.guidance, { encoding: "utf8", mode: 0o600 });

	const pushWidget = (phase: string, update?: RunnerSubagentUpdate): void => {
		setRunnerSubagentWidget(ctx, WIDGET_KEY, [
			`objective ${slug} · step ${stepNumber} · ${phase}`,
			...(update === undefined ? [] : formatRunnerSubagentActivityWidgetLines(update)),
		]);
	};

	try {
		pushWidget("runner-begin");
		const beginExec = normalizeExecResult(
			await pi.exec(
				"sdl",
				[
					"objective",
					"exec",
					"runner-begin",
					slug,
					...(input.recover === true ? ["--recover"] : []),
					"--guidance",
					`@${guidancePath}`,
					"--report-path",
					reportPath,
					"--format",
					"json",
				],
				{ cwd: ctx.cwd },
			),
		);
		await writeFile(factsPath, beginExec.stdout, { encoding: "utf8", mode: 0o600 });

		const beginParsed = parseMachineEnvelopeData(beginExec.stdout, {
			label: "runner-begin envelope",
			stdoutTail: { maxChars: MAX_FAILURE_TAIL_CHARS },
		});
		if (beginParsed.type !== "valid" || beginExec.code !== 0) {
			return beginFailureResult(beginExec, beginParsed.type === "valid" ? undefined : beginParsed.message);
		}
		const prompt = beginParsed.data.prompt;
		if (typeof prompt !== "string" || prompt.length === 0) {
			return beginFailureResult(beginExec, "runner-begin envelope carried no subagent prompt.");
		}

		pushWidget("subagent");
		const subagent = await dispatchRunnerSubagent(
			pi,
			{ cwd: ctx.cwd, ...(signal === undefined ? {} : { signal }) },
			{
				title: input.title ?? `objective ${slug} step ${stepNumber}`,
				prompt,
				returnMode: "final-text",
				...(input.model === undefined ? {} : { model: input.model }),
				onProgress: (update) => pushWidget("subagent", update),
			},
		);
		if (subagent.status === "cancelled" || signal?.aborted === true) {
			return {
				content: [
					{
						type: "text",
						text:
							`Runner step cancelled between runner-begin and runner-finish for objective ${slug}. runner-finish was NOT run, so no checkpoint was judged and the worktree may hold uncommitted subagent changes. Inspect the worktree, then recover by calling ${TOOL_NAME} again with recover: true and sharpened guidance.`,
					},
				],
				details: {
					phase: "subagent",
					reportPath,
					factsPath,
					subagent: subagentDetails(subagent),
				},
			};
		}

		// Every non-cancelled outcome proceeds to finish — the report file, not the final text, is
		// the contract; finish itself yields a malfunction checkpoint if the report is missing.
		pushWidget("runner-finish");
		const finishExec = normalizeExecResult(
			await pi.exec(
				"sdl",
				["objective", "exec", "runner-finish", slug, "--facts", `@${factsPath}`, "--format", "json"],
				{ cwd: ctx.cwd },
			),
		);
		const checkpoint = extractCheckpointData(finishExec.stdout);
		if (checkpoint === undefined) {
			return {
				content: [
					{
						type: "text",
						text: [
							`runner-finish produced no parseable checkpoint envelope for objective ${slug} (exit ${finishExec.code}). Treat this as a malfunction: read the diagnostics below and check the worktree before anything else.`,
							"",
							"stdout tail:",
							tailText(finishExec.stdout, { maxChars: MAX_FAILURE_TAIL_CHARS }),
							"",
							"stderr tail:",
							tailText(finishExec.stderr, { maxChars: MAX_FAILURE_TAIL_CHARS }),
						].join("\n"),
					},
				],
				details: {
					phase: "finish",
					exitCode: finishExec.code,
					reportPath,
					factsPath,
					subagent: subagentDetails(subagent),
				},
			};
		}

		return {
			content: [{ type: "text", text: checkpoint.checkpointMarkdown }],
			details: {
				phase: "finish",
				exitCode: finishExec.code,
				status: checkpoint.data.status,
				mode: checkpoint.data.mode,
				baseBranch: checkpoint.data.baseBranch,
				branch: checkpoint.data.branch,
				commitSha: checkpoint.data.commitSha,
				changedPaths: checkpoint.data.changedPaths,
				gateChecks: checkpoint.data.gateChecks,
				stopReason: checkpoint.data.stopReason,
				reportPath,
				factsPath,
				subagent: subagentDetails(subagent),
			},
		};
	} finally {
		setRunnerSubagentWidget(ctx, WIDGET_KEY, undefined);
	}

	function beginFailureResult(exec: ExecResult, envelopeMessage: string | undefined): ToolResult {
		const stderrTail = tailText(exec.stderr, { maxChars: MAX_FAILURE_TAIL_CHARS });
		return {
			content: [
				{
					type: "text",
					text: [
						`runner-begin refused or failed for objective ${slug} (exit ${exec.code}). Nothing was dispatched; the parent decides the next move.`,
						...(envelopeMessage === undefined ? [] : ["", envelopeMessage]),
						...(stderrTail.length === 0 ? [] : ["", "stderr tail:", stderrTail]),
					].join("\n"),
				},
			],
			details: { phase: "begin", exitCode: exec.code, reportPath, factsPath },
		};
	}
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
		...(sessionFile === undefined ? {} : { sessionFile }),
		...(result.usage === undefined ? {} : { usage: result.usage }),
	};
}

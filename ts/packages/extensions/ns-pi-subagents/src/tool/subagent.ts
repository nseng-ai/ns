import { z } from "zod";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { formatErrorMessage, formatZodError, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import type { ToolContext, ToolDefinition, ToolResult } from "@nseng-ai/pi/runtime/tool-types";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";

import {
	buildSubagentCatalog,
	definitionDiagnostic,
	type SubagentAgentDescriptor,
	type SubagentAgentRegistry,
} from "../agents/registry.ts";
import { dispatchExplorerSubagent, type ExplorerRetryEvidence } from "../explore/dispatch.ts";
import {
	resultDiagnostic,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagents/index.ts";
import { buildCuratedRunnerSubagentContext } from "../runner-subagents/curated-context.ts";
import { runnerSubagentSessionFile } from "../runner-subagents/presentation.ts";
import { resolveRunnerSubagentLaunch } from "../runner-subagents/subagent-process.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import type { ReadGitHead } from "../fleet/git-head.ts";
import {
	dispatchSubagentBatch,
	SUBAGENT_TASK_NOT_STARTED,
	type ToolkitDispatchBatchResult,
} from "../toolkit/dispatch.ts";
import type { SubagentRuntimeKind, SubagentRuntimeRegistry } from "../runtime/seam.ts";

export const SUBAGENT_TOOL_NAME = "subagent";

const taskSchema = z.object({
	title: z.string().trim().min(1).max(200),
	prompt: z.string().trim().min(1).max(50_000),
});
const inputSchema = z.object({
	agent: z.string().trim().min(1),
	tasks: z.array(taskSchema).min(1),
	execution: z.enum(["auto", "subprocess", "in-process"]).optional(),
	model: z.string().trim().min(1).optional(),
});
export type SubagentToolInput = z.infer<typeof inputSchema>;

export interface SubagentToolHost extends RunnerSubagentPi {
	registerTool(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface RegisterSubagentToolOptions {
	cwd: string;
	agents: SubagentAgentRegistry;
	runtimes(ctx: ToolContext): SubagentRuntimeRegistry;
	fleetRegistry: SubagentFleetRegistry;
	readGitHead?: ReadGitHead;
	loadAgentDefinition?: (name: string, cwd: string) => PiAgentDefinition;
	timers?: TimerScheduler;
}

export interface SubagentToolRegistration {
	readonly doctrineSections: readonly string[];
}

interface SubagentTaskOutcome {
	result: RunnerSubagentResult;
	retry?: ExplorerRetryEvidence;
}

export function registerSubagentTool(
	pi: SubagentToolHost,
	options: RegisterSubagentToolOptions,
): SubagentToolRegistration {
	const healthy = options.agents.entries.filter(
		(entry) => entry.diagnostic === undefined && entry.definition !== undefined,
	);
	const catalog = buildSubagentCatalog(options.agents.entries);
	pi.registerTool({
		name: SUBAGENT_TOOL_NAME,
		label: "Subagent",
		description: `Delegate focused work to a registered agent policy.\n${catalog}`,
		promptSnippet: "Use subagent for focused explorer reconnaissance or a single delegated task.",
		promptGuidelines: healthy.flatMap((entry) => entry.definition?.promptGuidelines ?? []),
		parameters: parameters(options.agents.names),
		execute: async (_id, raw, signal, onUpdate, ctx) => {
			const parsed = inputSchema.safeParse(raw);
			if (!parsed.success) throw new Error(formatZodError(parsed.error));
			return await executeSubagent({
				pi,
				options,
				input: parsed.data,
				...optionalEntry("parentSignal", signal),
				...optionalEntry("onUpdate", onUpdate),
				ctx,
			});
		},
	});
	return {
		doctrineSections: healthy
			.flatMap((entry) =>
				entry.definition === undefined ? [] : [entry.definition.delegationDoctrine.join("\n")],
			)
			.filter((section) => section.length > 0),
	};
}

function parameters(agentNames: readonly string[]): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			agent: {
				type: "string",
				enum: agentNames,
				description: "Registered behavioral agent policy.",
			},
			tasks: {
				type: "array",
				minItems: 1,
				description: "One or more focused tasks; the selected agent enforces its task limit.",
				items: {
					type: "object",
					properties: { title: { type: "string" }, prompt: { type: "string" } },
					required: ["title", "prompt"],
					additionalProperties: false,
				},
			},
			execution: { type: "string", enum: ["auto", "subprocess", "in-process"] },
			model: { type: "string", description: "Optional explicit Pi model override." },
		},
		required: ["agent", "tasks"],
		additionalProperties: false,
	};
}

interface ExecuteSubagentOptions {
	pi: SubagentToolHost;
	options: RegisterSubagentToolOptions;
	input: SubagentToolInput;
	parentSignal?: AbortSignal;
	onUpdate?: (update: Partial<ToolResult>) => void;
	ctx: ToolContext;
}

async function executeSubagent(args: ExecuteSubagentOptions): Promise<ToolResult> {
	const { pi, options, input, parentSignal, onUpdate, ctx } = args;
	const entry = options.agents.get(input.agent);
	if (entry === undefined) return configurationError(`Unknown subagent agent "${input.agent}".`);
	const descriptor = entry.descriptor;
	if (input.tasks.length < descriptor.minTasks || input.tasks.length > descriptor.maxTasks) {
		return configurationError(
			`${input.agent} accepts ${descriptor.minTasks === descriptor.maxTasks ? `exactly ${descriptor.minTasks}` : `${descriptor.minTasks}-${descriptor.maxTasks}`} task(s); received ${input.tasks.length}.`,
		);
	}
	const loadDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
	let definition: PiAgentDefinition;
	try {
		definition = loadDefinition(descriptor.name, ctx.cwd);
	} catch (error) {
		return configurationError(
			`${descriptor.definitionPath} could not be loaded: ${formatErrorMessage(error)}`,
		);
	}
	const definitionProblem = definitionDiagnostic(descriptor, definition);
	if (definitionProblem !== undefined) return configurationError(definitionProblem);
	const execution = input.execution ?? "auto";
	const runtime = options.runtimes(ctx).resolve({
		execution,
		supported: descriptor.supportedRuntimes,
		preference: descriptor.runtimePreference,
	});
	if (!runtime.ok) return configurationError(runtime.diagnostic);
	const scope = createAbortScope(
		parentSignal,
		descriptor.wallClockMs,
		options.timers ?? unrefTimerScheduler,
	);
	try {
		const results = await dispatchSubagentBatch(
			{
				pi,
				runtime: runtime.runtime,
				fleetRegistry: options.fleetRegistry,
				...optionalEntry("readGitHead", options.readGitHead),
			},
			{
				ctx: { ...ctx, signal: scope.signal, ...optionalEntry("onUpdate", onUpdate) },
				tasks: input.tasks,
				taskTitle: (task) => task.title,
				taskPrompt: (task) => task.prompt,
				maxConcurrency: descriptor.maxConcurrency,
				signal: scope.signal,
				run: async (task, _index, onProgress) => {
					onUpdate?.({
						content: [{ type: "text", text: `Running ${input.agent} subagent: ${task.title}` }],
					});
					return await runTask({
						pi,
						options,
						ctx,
						input,
						task,
						definition,
						descriptor,
						runtime: runtime.runtime,
						signal: scope.signal,
						onProgress,
					});
				},
				resultForTracking: (outcome) => ({
					result: outcome.result,
					...optionalEntry("retry", outcome.retry),
				}),
			},
		);
		return formatResult({ descriptor, execution: runtime.kind, tasks: input.tasks, results });
	} finally {
		scope.dispose();
	}
}

async function runTask(args: {
	pi: SubagentToolHost;
	options: RegisterSubagentToolOptions;
	ctx: ToolContext;
	input: SubagentToolInput;
	task: SubagentToolInput["tasks"][number];
	definition: PiAgentDefinition;
	descriptor: SubagentAgentDescriptor;
	runtime: import("../runtime/seam.ts").SubagentRuntime;
	signal: AbortSignal;
	onProgress: (update: RunnerSubagentUpdate) => void;
}): Promise<SubagentTaskOutcome> {
	const runnerCtx: RunnerSubagentContext = {
		cwd: args.ctx.cwd,
		signal: args.signal,
		...optionalEntry("model", args.ctx.model),
	};
	const descriptor = args.descriptor;
	if (descriptor.modelPolicy === "explorer-same-model-retry") {
		const outcome = await dispatchExplorerSubagent({
			pi: args.pi,
			ctx: runnerCtx,
			intent: {
				title: args.task.title,
				prompt: args.task.prompt,
				...optionalEntry("model", args.input.model),
				signal: args.signal,
				onProgress: args.onProgress,
			},
			definition: args.definition,
			dependencies: { runtime: args.runtime },
		});
		return {
			result: outcome.result,
			...optionalEntry("retry", outcome.retry),
		};
	}
	let prompt = composePiAgentPrompt(args.definition, args.task);
	if (descriptor.promptContext === "curated-worktree") {
		const curated = await buildCuratedRunnerSubagentContext({
			title: args.task.title,
			prompt: args.task.prompt,
			cwd: args.ctx.cwd,
			execGit: (gitArgs, timeoutMs) =>
				args.pi.exec("git", [...gitArgs], {
					cwd: args.ctx.cwd,
					timeout: timeoutMs,
					...optionalEntry("signal", args.signal),
				}),
		});
		prompt = `${prompt}\n\n${curated.markdown}`;
	}
	const dispatchOptions = {
		title: args.task.title,
		prompt,
		returnMode: "final-text" as const,
		tools: descriptor.tools,
		cwd: args.ctx.cwd,
		signal: args.signal,
		onProgress: args.onProgress,
		...optionalEntry("model", args.input.model),
	};
	const launch = resolveRunnerSubagentLaunch(args.pi, runnerCtx, dispatchOptions);
	const result = await args.runtime.dispatch({
		pi: args.pi,
		ctx: runnerCtx,
		options: {
			...dispatchOptions,
			...optionalEntry("preResolvedLaunch", launch),
		},
	});
	return { result };
}

interface FormatResultOptions {
	descriptor: SubagentAgentDescriptor;
	execution: SubagentRuntimeKind;
	tasks: SubagentToolInput["tasks"];
	results: readonly ToolkitDispatchBatchResult<SubagentTaskOutcome>[];
}

function formatResult(options: FormatResultOptions): ToolResult {
	const { descriptor, execution, tasks, results } = options;
	const agent = descriptor.name;
	const finalTextCap = Math.min(
		descriptor.maxTaskFinalTextChars,
		Math.floor((descriptor.maxFleetFinalTextChars ?? Number.MAX_SAFE_INTEGER) / tasks.length),
	);
	const details = tasks.map((task, index) => {
		const outcome = results[index];
		if (outcome === undefined) {
			throw new Error(`Subagent batch omitted positional result ${index}.`);
		}
		if (outcome === SUBAGENT_TASK_NOT_STARTED)
			return {
				agent,
				execution,
				title: task.title,
				status: "cancelled",
				diagnostic: "Task was not started.",
			};
		const result = outcome.result;
		const originalFinalText = result.status === "final-text" ? result.finalText : undefined;
		const finalText = originalFinalText?.slice(0, finalTextCap);
		const sessionFile = runnerSubagentSessionFile(result);
		return {
			agent,
			execution,
			title: task.title,
			status: result.status,
			...optionalEntry("sessionFile", sessionFile),
			...optionalEntry("diagnostic", resultDiagnostic(result)),
			...optionalEntry("retry", outcome.retry),
			...(finalText === undefined || originalFinalText === undefined
				? {}
				: { finalText, finalTextTruncated: finalText.length < originalFinalText.length }),
		};
	});
	const lines = [
		`subagent result: ${details.filter((detail) => detail.status === "final-text").length}/${tasks.length} completed`,
	];
	for (const detail of details) {
		lines.push(
			"",
			`### ${detail.title} — ${detail.status}`,
			`Agent: ${agent}; execution: ${execution}`,
		);
		if ("sessionFile" in detail) lines.push(`Session: ${detail.sessionFile ?? "unavailable"}`);
		if ("finalText" in detail && detail.finalText !== undefined) lines.push("", detail.finalText);
		if ("retry" in detail && detail.retry !== undefined) {
			lines.push(
				`Retry: ${detail.status === "final-text" ? "succeeded after" : "attempted after"} transient ${detail.retry.firstAttemptStatus} — ${detail.retry.firstAttemptDiagnostic}`,
			);
		}
		if ("diagnostic" in detail && detail.diagnostic !== undefined)
			lines.push(`Diagnostic: ${detail.diagnostic}`);
	}
	return {
		content: [{ type: "text", text: lines.join("\n") }],
		details: {
			status: details.every((detail) => detail.status === "final-text") ? "completed" : "partial",
			tasks: details,
		},
	};
}

function configurationError(diagnostic: string): ToolResult {
	return {
		content: [{ type: "text", text: `subagent configuration error: ${diagnostic}` }],
		details: { status: "configuration-error", diagnostic },
		isError: true,
	};
}

function createAbortScope(
	parent: AbortSignal | undefined,
	wallClockMs: number | undefined,
	timers: TimerScheduler,
): { signal: AbortSignal; dispose(): void } {
	const controller = new AbortController();
	let timer: ScheduledTimer | undefined;
	const abort = (): void => {
		if (!controller.signal.aborted) controller.abort(parent?.reason ?? "subagent call cancelled");
	};
	if (parent?.aborted) abort();
	else parent?.addEventListener("abort", abort, { once: true });
	if (wallClockMs !== undefined)
		timer = timers.setTimeout(
			() => controller.abort(`subagent wall-clock limit exceeded after ${wallClockMs}ms`),
			wallClockMs,
		);
	return {
		signal: controller.signal,
		dispose() {
			timer?.cancel();
			parent?.removeEventListener("abort", abort);
		},
	};
}

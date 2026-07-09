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
	definitionDiagnostic,
	type SubagentAgentDescriptor,
	type SubagentAgentRegistry,
} from "../agents/registry.ts";
import { dispatchExplorerSubagent } from "../explore/dispatch.ts";
import {
	mapWithConcurrency,
	resultDiagnostic,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../runner-subagents/index.ts";
import { buildCuratedRunnerSubagentContext } from "../runner-subagents/curated-context.ts";
import { resolveRunnerSubagentLaunch } from "../runner-subagents/subagent-process.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import type { ReadGitHead } from "../fleet/git-head.ts";
import { dispatchSubagent } from "../toolkit/dispatch.ts";
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

export function registerSubagentTool(
	pi: SubagentToolHost,
	options: RegisterSubagentToolOptions,
): SubagentToolRegistration {
	const healthy = options.agents.entries.filter(
		(entry) => entry.diagnostic === undefined && entry.definition !== undefined,
	);
	const catalog = healthy
		.map((entry) => `${entry.descriptor.name}: ${entry.definition?.description ?? ""}`)
		.join("\n");
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
			return await executeSubagent(pi, options, parsed.data, signal, onUpdate, ctx);
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

async function executeSubagent(
	pi: SubagentToolHost,
	options: RegisterSubagentToolOptions,
	input: SubagentToolInput,
	parentSignal: AbortSignal | undefined,
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
	ctx: ToolContext,
): Promise<ToolResult> {
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
		const results = await mapWithConcurrency({
			items: input.tasks,
			maxConcurrency: descriptor.maxConcurrency,
			signal: scope.signal,
			run: async (task) => {
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
					runtime: runtime.runtime,
					runtimeKind: runtime.kind,
					signal: scope.signal,
				});
			},
		});
		return formatResult(descriptor, runtime.kind, input.tasks, results);
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
	runtime: import("../runtime/seam.ts").SubagentRuntime;
	runtimeKind: SubagentRuntimeKind;
	signal: AbortSignal;
}): Promise<RunnerSubagentResult> {
	const runnerCtx: RunnerSubagentContext = {
		cwd: args.ctx.cwd,
		signal: args.signal,
		...(args.ctx.model === undefined ? {} : { model: args.ctx.model }),
	};
	const descriptor = args.options.agents.get(args.input.agent)?.descriptor;
	if (descriptor === undefined) {
		return configurationFailureResult(
			args.task.title,
			`Unknown subagent agent "${args.input.agent}".`,
		);
	}
	if (descriptor.modelPolicy === "cheap-explorer-with-failover" && args.input.model === undefined) {
		const trackedRuntime = {
			dispatch: async (input: import("../runtime/seam.ts").SubagentRuntimeDispatchInput) =>
				await dispatchSubagent(
					{
						pi: args.pi,
						runtime: args.runtime,
						fleetRegistry: args.options.fleetRegistry,
						...optionalEntry("readGitHead", args.options.readGitHead),
					},
					{
						ctx: { ...args.ctx, signal: args.signal },
						title: args.task.title,
						trackingPrompt: args.task.prompt,
						options: input.options,
					},
				),
		};
		return (
			await dispatchExplorerSubagent({
				pi: args.pi,
				ctx: runnerCtx,
				intent: { title: args.task.title, prompt: args.task.prompt, signal: args.signal },
				definition: args.definition,
				dependencies: { runtime: trackedRuntime },
			})
		).result;
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
					...(args.signal === undefined ? {} : { signal: args.signal }),
				}),
		});
		prompt = `${prompt}\n\n${curated.markdown}`;
	}
	const dispatchOptions = {
		title: args.task.title,
		prompt,
		returnMode: "final-text" as const,
		tools: descriptor.tools,
		...optionalEntry("model", args.input.model),
	};
	const launch = resolveRunnerSubagentLaunch(args.pi, runnerCtx, dispatchOptions);
	return await dispatchSubagent(
		{
			pi: args.pi,
			runtime: args.runtime,
			fleetRegistry: args.options.fleetRegistry,
			...optionalEntry("readGitHead", args.options.readGitHead),
		},
		{
			ctx: { ...args.ctx, signal: args.signal },
			title: args.task.title,
			trackingPrompt: args.task.prompt,
			options: {
				...dispatchOptions,
				...(launch === undefined ? {} : { preResolvedLaunch: launch }),
			},
		},
	);
}

function formatResult(
	descriptor: SubagentAgentDescriptor,
	execution: SubagentRuntimeKind,
	tasks: SubagentToolInput["tasks"],
	results: readonly (RunnerSubagentResult | undefined)[],
): ToolResult {
	const agent = descriptor.name;
	const finalTextCap = Math.min(
		descriptor.maxTaskFinalTextChars,
		Math.floor((descriptor.maxFleetFinalTextChars ?? Number.MAX_SAFE_INTEGER) / tasks.length),
	);
	const details = tasks.map((task, index) => {
		const result = results[index];
		if (result === undefined)
			return {
				agent,
				execution,
				title: task.title,
				status: "cancelled",
				diagnostic: "Task was not started.",
			};
		const originalFinalText = result.status === "final-text" ? result.finalText : undefined;
		const finalText = originalFinalText?.slice(0, finalTextCap);
		return {
			agent,
			execution,
			title: task.title,
			status: result.status,
			...((result.sessionFile ?? result.progress.sessionFile)
				? { sessionFile: result.sessionFile ?? result.progress.sessionFile }
				: {}),
			...optionalEntry("diagnostic", resultDiagnostic(result)),
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

function configurationFailureResult(title: string, diagnostic: string): RunnerSubagentResult {
	return {
		status: "error",
		diagnostic,
		error: { message: diagnostic },
		elapsedMs: 0,
		progress: { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
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

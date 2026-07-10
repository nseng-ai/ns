import { z } from "zod";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { formatZodError, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import {
	composePiAgentPrompt,
	type PiAgentDefinition,
} from "@nseng-ai/pi/runtime/agent-definition";
import { isProviderAuthConfigured } from "@nseng-ai/pi/runtime/auth";
import type { ToolContext, ToolDefinition, ToolResult } from "@nseng-ai/pi/runtime/tool-types";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";

import {
	buildSubagentCatalog,
	definitionDiagnostic,
	definitionLoadDiagnostic,
	isHealthySubagentEntry,
	type SubagentAgentDescriptor,
	type SubagentAgentRegistry,
} from "../agents/registry.ts";
import { resolveDescriptorModel, type IsProviderAuthConfigured } from "../agents/model-policy.ts";
import {
	resultDiagnostic,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagents/index.ts";
import { buildCuratedRunnerSubagentContext } from "../runner-subagents/curated-context.ts";
import { runnerSubagentSessionFile } from "../runner-subagents/presentation.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import type { ReadGitHead } from "../fleet/git-head.ts";
import { dispatchSubagentBatch } from "./dispatch.ts";
import {
	SUBAGENT_RUNTIME_KINDS,
	type SubagentRuntime,
	type SubagentRuntimeKind,
	type SubagentRuntimeRegistry,
} from "../runtime/seam.ts";

export const SUBAGENT_TOOL_NAME = "subagent";

function buildInputSchema(agentNames: readonly string[]) {
	const taskSchema = z.object({
		title: z.string().trim().min(1).max(200),
		prompt: z.string().trim().min(1).max(50_000),
	});
	return z.object({
		agent: agentSchema(agentNames).describe("Registered behavioral agent policy."),
		tasks: z
			.array(taskSchema)
			.min(1)
			.describe("One or more focused tasks; the selected agent enforces its task limit."),
		execution: z.enum(["auto", ...SUBAGENT_RUNTIME_KINDS]).optional(),
		model: z.string().trim().min(1).optional().describe("Optional explicit Pi model override."),
	});
}

function agentSchema(agentNames: readonly string[]): z.ZodType<string, string> {
	const [first, ...rest] = agentNames;
	if (first === undefined) return z.string().trim().min(1);
	return z.enum([first, ...rest]);
}

/**
 * Model-visible JSON schema derived from the zod input schema. zod strip-mode
 * objects accept-and-drop unknown keys at parse time, so the derivation omits
 * additionalProperties; re-add the closed-object contract for the model.
 */
function buildParameters(schema: ReturnType<typeof buildInputSchema>): Record<string, unknown> {
	const parameters = z.toJSONSchema(schema, { io: "input" });
	closeObjectSchemas(parameters);
	return parameters;
}

function closeObjectSchemas(node: z.core.JSONSchema.JSONSchema): void {
	if (node.type === "object" && node.additionalProperties === undefined) {
		node.additionalProperties = false;
	}
	for (const property of Object.values(node.properties ?? {})) {
		if (typeof property === "object") closeObjectSchemas(property);
	}
	if (typeof node.items === "object" && !Array.isArray(node.items)) {
		closeObjectSchemas(node.items);
	}
}

export type SubagentToolInput = z.infer<ReturnType<typeof buildInputSchema>>;

export interface SubagentToolHost extends RunnerSubagentPi {
	registerTool(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface RegisterSubagentToolOptions {
	agents: SubagentAgentRegistry;
	runtimes: SubagentRuntimeRegistry;
	fleetRegistry: SubagentFleetRegistry;
	readGitHead?: ReadGitHead;
	loadAgentDefinition(name: string, cwd: string): PiAgentDefinition;
	timers?: TimerScheduler;
	isProviderAuthConfigured?: IsProviderAuthConfigured;
}

export interface SubagentToolRegistration {
	readonly doctrineSections: readonly string[];
}

export function registerSubagentTool(
	pi: SubagentToolHost,
	options: RegisterSubagentToolOptions,
): SubagentToolRegistration {
	const healthy = options.agents.entries.filter(isHealthySubagentEntry);
	const catalog = buildSubagentCatalog(options.agents.entries);
	const inputSchema = buildInputSchema(options.agents.names);
	pi.registerTool({
		name: SUBAGENT_TOOL_NAME,
		label: "Subagent",
		description: `Delegate focused work to a registered agent policy.\n${catalog}`,
		promptSnippet: "Use subagent for focused explorer reconnaissance or a single delegated task.",
		promptGuidelines: healthy.flatMap((entry) => entry.definition.promptGuidelines),
		parameters: buildParameters(inputSchema),
		execute: async (_id, raw, signal, onUpdate, ctx) => {
			const parsed = inputSchema.safeParse(raw);
			if (!parsed.success) return configurationError(formatZodError(parsed.error));
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
			.map((entry) => entry.definition.delegationDoctrine.join("\n"))
			.filter((section) => section.length > 0),
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

async function executeSubagent(
	args: ExecuteSubagentOptions,
): Promise<ToolResult<SubagentToolDetails>> {
	const { pi, options, input, parentSignal, onUpdate, ctx } = args;
	const entry = options.agents.get(input.agent);
	if (entry === undefined) return configurationError(`Unknown subagent agent "${input.agent}".`);
	const descriptor = entry.descriptor;
	if (input.tasks.length < descriptor.minTasks || input.tasks.length > descriptor.maxTasks) {
		return configurationError(
			`${input.agent} accepts ${descriptor.minTasks === descriptor.maxTasks ? `exactly ${descriptor.minTasks}` : `${descriptor.minTasks}-${descriptor.maxTasks}`} task(s); received ${input.tasks.length}.`,
		);
	}
	let definition: PiAgentDefinition;
	try {
		definition = options.loadAgentDefinition(descriptor.name, ctx.cwd);
	} catch (error) {
		return configurationError(definitionLoadDiagnostic(descriptor.definitionPath, error));
	}
	const definitionProblem = definitionDiagnostic(descriptor, definition);
	if (definitionProblem !== undefined) return configurationError(definitionProblem);
	const execution = input.execution ?? "auto";
	const runtime = options.runtimes.resolve({
		ctx,
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
				ctx,
				tasks: input.tasks,
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
	runtime: SubagentRuntime;
	signal: AbortSignal;
	onProgress: (update: RunnerSubagentUpdate) => void;
}): Promise<RunnerSubagentResult> {
	const runnerCtx: RunnerSubagentContext = {
		cwd: args.ctx.cwd,
		signal: args.signal,
		...optionalEntry("model", args.ctx.model),
	};
	const descriptor = args.descriptor;
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
	const selectedModel = selectTaskModel({
		policy: descriptor.modelPolicy,
		...optionalEntry("explicitModel", args.input.model),
		...optionalEntry("parentModel", args.ctx.model),
		isProviderAuthConfigured: args.options.isProviderAuthConfigured ?? isProviderAuthConfigured,
	});
	const dispatchOptions = {
		title: args.task.title,
		prompt,
		returnMode: "final-text" as const,
		tools: descriptor.tools,
		cwd: args.ctx.cwd,
		signal: args.signal,
		onProgress: args.onProgress,
		...optionalEntry("model", selectedModel),
	};
	return await args.runtime.dispatch({
		pi: args.pi,
		ctx: runnerCtx,
		options: dispatchOptions,
	});
}

function selectTaskModel(input: {
	policy: SubagentAgentDescriptor["modelPolicy"];
	explicitModel?: string;
	parentModel?: RunnerSubagentContext["model"];
	isProviderAuthConfigured: IsProviderAuthConfigured;
}): string | undefined {
	if (input.explicitModel !== undefined) return input.explicitModel;
	return resolveDescriptorModel({
		policy: input.policy,
		...optionalEntry("parentModel", input.parentModel),
		isProviderAuthConfigured: input.isProviderAuthConfigured,
	});
}

export interface SubagentTaskDetail {
	status: RunnerSubagentResult["status"];
	agent: string;
	execution: SubagentRuntimeKind;
	title: string;
	sessionFile?: string;
	finalText?: string;
	finalTextTruncated?: boolean;
	diagnostic?: string;
}

export type SubagentToolDetails =
	| { status: "completed" | "partial"; tasks: readonly SubagentTaskDetail[] }
	| { status: "configuration-error"; diagnostic: string };

interface FormatResultOptions {
	descriptor: SubagentAgentDescriptor;
	execution: SubagentRuntimeKind;
	tasks: SubagentToolInput["tasks"];
	results: readonly RunnerSubagentResult[];
}

function formatResult(options: FormatResultOptions): ToolResult<SubagentToolDetails> {
	const { descriptor, execution, tasks, results } = options;
	const agent = descriptor.name;
	const finalTextCap = Math.min(
		descriptor.maxTaskFinalTextChars,
		Math.floor((descriptor.maxFleetFinalTextChars ?? Number.MAX_SAFE_INTEGER) / tasks.length),
	);
	const details: SubagentTaskDetail[] = tasks.map((task, index) => {
		const result = results[index];
		if (result === undefined) {
			throw new Error(`Subagent batch omitted positional result ${index}.`);
		}
		const originalFinalText = result.status === "final-text" ? result.finalText : undefined;
		const finalText = originalFinalText?.slice(0, finalTextCap);
		return {
			agent,
			execution,
			title: task.title,
			status: result.status,
			...optionalEntry("sessionFile", runnerSubagentSessionFile(result)),
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
		if (detail.sessionFile !== undefined) lines.push(`Session: ${detail.sessionFile}`);
		if (detail.finalText !== undefined) lines.push("", detail.finalText);
		if (detail.diagnostic !== undefined) lines.push(`Diagnostic: ${detail.diagnostic}`);
	}
	return {
		content: [{ type: "text", text: lines.join("\n") }],
		details: {
			status: details.every((detail) => detail.status === "final-text") ? "completed" : "partial",
			tasks: details,
		},
	};
}

function configurationError(diagnostic: string): ToolResult<SubagentToolDetails> {
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
	if (wallClockMs !== undefined && !controller.signal.aborted)
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

import type { ExecOptions, ExecResult } from "@sdl/core/exec";

import type { WidgetRuntimeContext } from "../handoff/runtime-types.ts";
import { composePiAgentPrompt, type PiAgentDefinition } from "../pi-agent-definition.ts";
import {
	defaultRunnerSubagentLaunchMetadata,
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagent.ts";
import {
	buildCuratedRunnerSubagentContext,
	type CuratedRunnerSubagentContext,
} from "./curated-context.ts";
import { resolveRunnerSubagentLaunch } from "./subagent-process.ts";
import { withRunnerSubagentWidget } from "./widget.ts";

interface PrepareRunnerSubagentFinalTextDispatchInput {
	pi: RunnerSubagentPi & {
		exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	};
	ctx: RunnerSubagentContext;
	definition: PiAgentDefinition;
	title: string;
	prompt: string;
	model?: string;
	signal?: AbortSignal;
}

interface PreparedRunnerSubagentDispatch {
	childPrompt: string;
	curatedContext: CuratedRunnerSubagentContext;
	launch: RunnerSubagentLaunchMetadata;
}

export interface RunFinalTextSubagentInput {
	pi: RunnerSubagentPi & {
		exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	};
	ctx: RunnerSubagentContext & WidgetRuntimeContext;
	definition: PiAgentDefinition;
	title: string;
	prompt: string;
	widgetKey: string;
	model?: string;
	signal?: AbortSignal;
	tools?: readonly string[];
	onStart?: (start: {
		curatedContext: CuratedRunnerSubagentContext;
		launch: RunnerSubagentLaunchMetadata;
		update: RunnerSubagentUpdate;
	}) => void;
	onProgress?: (update: RunnerSubagentUpdate) => void;
}

export interface RunFinalTextSubagentResult {
	result: RunnerSubagentResult;
	curatedContext: CuratedRunnerSubagentContext;
	launch: RunnerSubagentLaunchMetadata;
}

export async function runFinalTextSubagent(
	input: RunFinalTextSubagentInput,
): Promise<RunFinalTextSubagentResult> {
	const { childPrompt, curatedContext, launch } =
		await prepareRunnerSubagentFinalTextDispatch(input);
	input.onStart?.({
		curatedContext,
		launch,
		update: {
			progress: {
				title: input.title,
				state: "starting",
				toolCount: 0,
				turnCount: 0,
				elapsedMs: 0,
				launch,
			},
			activity: {},
		},
	});
	const result = await withRunnerSubagentWidget({
		ctx: input.ctx,
		key: input.widgetKey,
		initial: { title: input.title, launch },
		run: async (updateWidgetProgress) =>
			await dispatchRunnerSubagent(input.pi, buildRunnerSubagentContext(input), {
				title: input.title,
				prompt: childPrompt,
				...(input.model === undefined ? {} : { model: input.model }),
				returnMode: "final-text",
				preResolvedLaunch: launch,
				...(input.tools === undefined ? {} : { tools: input.tools }),
				onProgress: (update) => {
					input.onProgress?.(update);
					updateWidgetProgress(update);
				},
			}),
	});
	return { result, curatedContext, launch };
}

async function prepareRunnerSubagentFinalTextDispatch(
	input: PrepareRunnerSubagentFinalTextDispatchInput,
): Promise<PreparedRunnerSubagentDispatch> {
	const curatedContext = await buildCuratedRunnerSubagentContext({
		title: input.title,
		prompt: input.prompt,
		cwd: input.ctx.cwd,
		execGit: (gitArgs, timeoutMs) =>
			input.pi.exec("git", [...gitArgs], {
				cwd: input.ctx.cwd,
				timeout: timeoutMs,
				...(input.signal === undefined ? {} : { signal: input.signal }),
			}),
	});
	const childPrompt = `${composePiAgentPrompt(input.definition, {
		title: input.title,
		prompt: input.prompt,
	})}\n\n${curatedContext.markdown}`;
	const launch =
		resolveRunnerSubagentLaunch(input.pi, input.ctx, {
			title: input.title,
			prompt: childPrompt,
			returnMode: "final-text",
			...(input.model === undefined ? {} : { model: input.model }),
		}) ?? defaultRunnerSubagentLaunchMetadata();

	return { childPrompt, curatedContext, launch };
}

function buildRunnerSubagentContext(input: RunFinalTextSubagentInput): RunnerSubagentContext {
	return {
		cwd: input.ctx.cwd,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		...(input.ctx.model === undefined ? {} : { model: input.ctx.model }),
	};
}

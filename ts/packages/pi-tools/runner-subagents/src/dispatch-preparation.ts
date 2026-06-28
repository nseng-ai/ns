import type { ExecOptions, ExecResult } from "@sdl/core/exec";

import { composePiAgentPrompt, type PiAgentDefinition } from "@sdl/pi/runtime/agent-definition";
import {
	defaultRunnerSubagentLaunchMetadata,
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "@sdl/pi/runner-subagents";
import {
	buildCuratedRunnerSubagentContext,
	type CuratedRunnerSubagentContext,
} from "./curated-context.ts";
import { resolveRunnerSubagentLaunch } from "@sdl/pi/runner-subagents/process";
import {
	buildInitialRunnerSubagentUpdate,
	withRunnerSubagentWidget,
	type WidgetRuntimeContext,
} from "./widget.ts";

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
		update: buildInitialRunnerSubagentUpdate({ title: input.title, launch }),
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

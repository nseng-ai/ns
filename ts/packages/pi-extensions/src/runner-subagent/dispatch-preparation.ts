import type { ExecOptions, ExecResult } from "@sdl/core/exec";

import { composePiAgentPrompt, type PiAgentDefinition } from "../pi-agent-definition.ts";
import {
	defaultRunnerSubagentLaunchMetadata,
	type RunnerSubagentContext,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
} from "../runner-subagent.ts";
import {
	buildCuratedRunnerSubagentContext,
	type CuratedRunnerSubagentContext,
} from "./curated-context.ts";
import { resolveRunnerSubagentLaunch } from "./subagent-process.ts";

export interface PrepareRunnerSubagentFinalTextDispatchInput {
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

export interface PreparedRunnerSubagentDispatch {
	childPrompt: string;
	curatedContext: CuratedRunnerSubagentContext;
	launch: RunnerSubagentLaunchMetadata;
}

export async function prepareRunnerSubagentFinalTextDispatch(
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

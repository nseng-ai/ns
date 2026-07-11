#!/usr/bin/env node

import { z } from "zod";

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import {
	applyCmuxWorkspaceSummaryCommand,
	cmuxWorkspaceSummaryRequestSchema,
	cmuxWorkspaceSummaryResultSchema,
	renderCmuxWorkspaceSummaryHuman,
} from "../cmux/workspace-summary.ts";

export interface CccCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	commands?: CommandExecApi;
}

export interface CccCliContext {
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
}

const entry = defineCli<CccCliContext, CccCliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "CCC repo orchestration tools.",
	prepareRun: ({ deps, cwd, env }) => {
		const context: CccCliContext = {
			commands: deps.commands ?? new NodeCommandExecApi(),
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		const execGroup = new ClinkrGroup<CccCliContext>({
			name: "exec",
			description: "Run hidden deterministic CCC operations for agents.",
			isHidden: true,
		});
		execGroup.command({
			name: "cmux-workspace-summary",
			summary: "Apply generated cmux workspace title and description fields.",
			description: "Apply generated cmux workspace title and description fields.",
			schema: cmuxWorkspaceSummaryRequestSchema,
			resultSchema: cmuxWorkspaceSummaryResultSchema,
			handler: handleCmuxWorkspaceSummary,
			renderHuman: renderCmuxWorkspaceSummaryHuman,
		});
		root.group(execGroup);
	},
});

export function buildCli(): ClinkrGroup<CccCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CccCliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function handleCmuxWorkspaceSummary(
	ctx: CccCliContext,
	request: z.output<typeof cmuxWorkspaceSummaryRequestSchema>,
) {
	return applyCmuxWorkspaceSummaryCommand({
		request,
		commands: ctx.commands,
		cwd: ctx.cwd,
		env: ctx.env,
	});
}

export const VERSION = entry.version;

await entry.runIfMain({ isImportMetaMain: import.meta.main });

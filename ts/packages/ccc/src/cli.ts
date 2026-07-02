#!/usr/bin/env node

import { z } from "zod";

import { ClinkrGroup, failure, negative, ok, type ClinkrExit } from "@sdl/clinkr";
import { defineCli, type CliEntrypointDeps } from "@sdl/core/cli-runtime";
import { NodeCommandExecApi } from "@sdl/core/exec";
import type { CommandExecApi } from "@sdl/core/command";

import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "./autobranch/checkpoint.ts";
import {
	createFlowAutobranchCheckpointFlow,
	type FlowAutobranchCheckpointInput,
	type FlowAutobranchRequest,
} from "sdl-flow/api";
import {
	applyCmuxWorkspaceSummaryCommand,
	cmuxWorkspaceSummaryRequestSchema,
	cmuxWorkspaceSummaryResultSchema,
	renderCmuxWorkspaceSummaryHuman,
} from "./cmux/workspace-summary.ts";

export const AUTOBRANCH_SUMMARY =
	"Create a Graphite branch from dirty worktree changes or the latest unpushed commit.";

type AutobranchSeamOverrides = Partial<
	Pick<
		FlowAutobranchCheckpointInput,
		"prepareCheckpointMessage" | "commitPreparedCheckpointMessage" | "readFile" | "stat" | "now"
	>
>;

export interface CccCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	commands?: CommandExecApi;
	autobranch?: AutobranchSeamOverrides;
}

export interface CccCliContext {
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	autobranch?: AutobranchSeamOverrides;
}

const autobranchRequestSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

type AutobranchRequest = z.infer<typeof autobranchRequestSchema>;

const autobranchSuccessSchema = z.object({
	summary: z.string(),
	warnings: z.array(z.string()),
});

const autobranchErrorDataSchema = z.object({
	outcome: z.enum(["refusal", "failure"]),
});

const autobranchResultSchema = z.union([autobranchSuccessSchema, autobranchErrorDataSchema]);

type AutobranchResult = z.infer<typeof autobranchResultSchema>;
type AutobranchErrorData = z.infer<typeof autobranchErrorDataSchema>;

const entry = defineCli<CccCliContext, CccCliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "CCC repo orchestration tools.",
	prepareRun: ({ deps, cwd, env, stdout, stderr }) => {
		const resolvedStdout = deps.stdout ?? stdout;
		const resolvedStderr = deps.stderr ?? stderr;
		const context: CccCliContext = {
			commands: deps.commands ?? new NodeCommandExecApi(),
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
			stdout: resolvedStdout,
			stderr: resolvedStderr,
			...(deps.autobranch === undefined ? {} : { autobranch: deps.autobranch }),
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
		execGroup.command({
			name: "autobranch",
			summary: AUTOBRANCH_SUMMARY,
			description: `Create a Graphite branch using \`gt create\` from dirty worktree changes or from the latest eligible unpushed commit.

Dirty worktree mode stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit. Clean worktree mode moves the latest eligible unpushed non-merge commit onto a new Graphite branch using recovery-branch verification.`,
			schema: autobranchRequestSchema,
			resultSchema: autobranchResultSchema,
			handler: handleAutobranch,
			renderHuman: renderAutobranch,
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

async function handleAutobranch(
	ctx: CccCliContext,
	request: AutobranchRequest,
): Promise<ClinkrExit<AutobranchResult>> {
	const args: FlowAutobranchRequest = request.slug === undefined ? {} : { slug: request.slug };
	const autobranch = ctx.autobranch ?? {};
	const result = await createFlowAutobranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, timeout) =>
			ctx.commands.exec(command, commandArgs, { cwd: ctx.cwd, timeout, env: ctx.env }),
		prepareCheckpointMessage:
			autobranch.prepareCheckpointMessage ??
			((snapshot) => prepareAutobranchCheckpointMessage(snapshot, ctx.env)),
		commitPreparedCheckpointMessage:
			autobranch.commitPreparedCheckpointMessage ??
			((message) =>
				commitAutobranchCheckpointMessage(
					(command, commandArgs, commandCwd, timeout) =>
						ctx.commands.exec(command, commandArgs, { cwd: commandCwd, timeout, env: ctx.env }),
					ctx.cwd,
					message,
				)),
		...(autobranch.readFile === undefined ? {} : { readFile: autobranch.readFile }),
		...(autobranch.stat === undefined ? {} : { stat: autobranch.stat }),
		...(autobranch.now === undefined ? {} : { now: autobranch.now }),
	});

	if (!result.ok) {
		const data: AutobranchErrorData = { outcome: result.outcome };
		if (result.outcome === "refusal") {
			return negative(result.error, { data, human: result.error });
		}
		return failure("autobranch-failed", result.error, data);
	}
	for (const warning of result.warnings) {
		ctx.stderr(`${warning.trimEnd()}\n`);
	}
	return ok({ summary: result.summary, warnings: result.warnings });
}

function renderAutobranch(result: AutobranchResult): string {
	if (!("summary" in result)) return result.outcome;
	return result.summary;
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });

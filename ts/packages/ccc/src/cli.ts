#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";

import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";

const VERSION = "0.1.0";
export const AUTOBRANCH_SUMMARY = "Create a Graphite branch from dirty worktree changes or the latest unpushed commit.";

type AutobranchSeamOverrides = Partial<
	Pick<AutobranchFlowInput, "prepareCheckpointMessage" | "commitPreparedCheckpointMessage" | "readFile" | "stat" | "now">
>;

export interface CccCliDeps {
	commands?: CommandExecApi | undefined;
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	autobranch?: AutobranchSeamOverrides | undefined;
}

export interface CccCliContext {
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	autobranch?: AutobranchSeamOverrides | undefined;
}

const autobranchRequestSchema = z.object({
	slug: z.string().optional().describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

type AutobranchRequest = z.infer<typeof autobranchRequestSchema>;

export function buildCli(): ClinkrGroup<CccCliContext> {
	const root = new ClinkrGroup<CccCliContext>({
		name: "ccc",
		description: "CCC repo orchestration tools.",
		version: VERSION,
		runtimeInfo,
	});

	const execGroup = new ClinkrGroup<CccCliContext>({
		name: "exec",
		description: "Run hidden deterministic CCC operations for agents.",
		isHidden: true,
	});
	execGroup.command(
		rawCommand({
			name: "autobranch",
			summary: AUTOBRANCH_SUMMARY,
			description: `Create a Graphite branch using \`gt create\` from dirty worktree changes or from the latest eligible unpushed commit.

Dirty worktree mode stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit. Clean worktree mode moves the latest eligible unpushed non-merge commit onto a new Graphite branch using recovery-branch verification.`,
			schema: autobranchRequestSchema,
			run: handleAutobranch,
		}),
	);
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CccCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});
	const commands = deps.commands ?? new NodeCommandExecApi();
	const env = deps.env ?? process.env;
	const cwd = deps.cwd ?? process.cwd();

	const context: CccCliContext = {
		commands,
		cwd,
		env,
		stdout,
		stderr,
		...(deps.autobranch === undefined ? {} : { autobranch: deps.autobranch }),
	};
	const io = resolveIo({ stdout, stderr });
	return buildCli().run(args, { context, io });
}

async function handleAutobranch(ctx: CccCliContext, request: AutobranchRequest): Promise<number> {
	let hasError = false;
	const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
	const autobranch = ctx.autobranch ?? {};
	await createAutobranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => ctx.commands.exec(command, commandArgs, { cwd, timeout, env: ctx.env }),
		prepareCheckpointMessage: autobranch.prepareCheckpointMessage ?? ((snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot, ctx.env)),
		commitPreparedCheckpointMessage:
			autobranch.commitPreparedCheckpointMessage ??
			((message) =>
				commitPreparedCheckpointMessageWithAsdlDev(
					(command, commandArgs, commandCwd, timeout) => ctx.commands.exec(command, commandArgs, { cwd: commandCwd, timeout, env: ctx.env }),
					ctx.cwd,
					message,
				)),
		notify: (message, level) => {
			const text = `${message.trimEnd()}\n`;
			if (level === "error") {
				hasError = true;
				ctx.stderr(text);
				return;
			}
			if (level === "warning") {
				ctx.stderr(text);
				return;
			}
			ctx.stdout(text);
		},
		setStatus: () => {},
		...(autobranch.readFile === undefined ? {} : { readFile: autobranch.readFile }),
		...(autobranch.stat === undefined ? {} : { stat: autobranch.stat }),
		...(autobranch.now === undefined ? {} : { now: autobranch.now }),
	});

	return hasError ? 1 : 0;
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/ccc bin ccc -> ts/packages/ccc/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}

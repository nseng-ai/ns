#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import type { PendingWorktreeSnapshot } from "asdl-dev/pending-worktree";

import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type PreparedCheckpointMessage,
} from "./autobranch/asdl-dev-checkpoint.ts";
import { createAutobranchCheckpointFlow } from "./autobranch/flow.ts";
import type { FileStat, ParsedAutobranchArgs } from "./autobranch/preparation.ts";

const VERSION = "0.1.0";
const AUTOBRANCH_SUMMARY = "Create a Graphite branch from dirty worktree changes or the latest unpushed commit.";

type NoticeLevel = "info" | "warning" | "error" | "success";

type PrepareCheckpointMessage = (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<PreparedCheckpointMessage>;
type CommitPreparedCheckpointMessage = (message: string) => Promise<{ summary: string } | { error: string }>;

export interface CccCliDeps {
	commands?: CommandExecApi | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	prepareCheckpointMessage?: PrepareCheckpointMessage | undefined;
	commitPreparedCheckpointMessage?: CommitPreparedCheckpointMessage | undefined;
	readFile?: ((path: string) => Promise<Uint8Array | string>) | undefined;
	stat?: ((path: string) => Promise<FileStat>) | undefined;
	now?: (() => number) | undefined;
}

export interface CccCliContext {
	commands: CommandExecApi;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	prepareCheckpointMessage: PrepareCheckpointMessage;
	commitPreparedCheckpointMessage: CommitPreparedCheckpointMessage;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: () => number;
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
		prepareCheckpointMessage: deps.prepareCheckpointMessage ?? ((snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot, env)),
		commitPreparedCheckpointMessage:
			deps.commitPreparedCheckpointMessage ??
			((message) =>
				commitPreparedCheckpointMessageWithAsdlDev(
					{
						exec: (command, commandArgs, options) => commands.exec(command, commandArgs, { ...options, env }),
					},
					cwd,
					message,
				)),
		...(deps.readFile === undefined ? {} : { readFile: deps.readFile }),
		...(deps.stat === undefined ? {} : { stat: deps.stat }),
		...(deps.now === undefined ? {} : { now: deps.now }),
	};
	const io = resolveIo({ stdout, stderr });
	return buildCli().run(args, { context, io });
}

async function handleAutobranch(ctx: CccCliContext, request: AutobranchRequest): Promise<number> {
	const notices: Array<{ message: string; level: NoticeLevel }> = [];
	const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
	await createAutobranchCheckpointFlow({
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => ctx.commands.exec(command, commandArgs, { cwd, timeout, env: ctx.env }),
		prepareCheckpointMessage: ctx.prepareCheckpointMessage,
		commitPreparedCheckpointMessage: ctx.commitPreparedCheckpointMessage,
		notify: (message, level) => {
			notices.push({ message, level });
		},
		setStatus: () => {},
		...(ctx.readFile === undefined ? {} : { readFile: ctx.readFile }),
		...(ctx.stat === undefined ? {} : { stat: ctx.stat }),
		...(ctx.now === undefined ? {} : { now: ctx.now }),
	});

	renderNotices(ctx, notices);
	return notices.some((notice) => notice.level === "error") ? 1 : 0;
}

function renderNotices(ctx: Pick<CccCliContext, "stdout" | "stderr">, notices: readonly { message: string; level: NoticeLevel }[]): void {
	for (const notice of notices) {
		const text = `${notice.message.trimEnd()}\n`;
		if (notice.level === "error" || notice.level === "warning") {
			ctx.stderr(text);
		} else {
			ctx.stdout(text);
		}
	}
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/ccc bin ccc -> ts/packages/ccc/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}

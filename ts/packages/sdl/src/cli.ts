#!/usr/bin/env node

import process from "node:process";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { runCheckpointCommand } from "./checkpoint.ts";
import { createRealSdlContext, type SdlContext } from "./context.ts";
import { CHECKPOINT_MODEL_ENV, DEFAULT_CHECKPOINT_MODEL_REF, LEGACY_CHECKPOINT_MODEL_ENV } from "./text-generation.ts";

export interface SdlCliDeps {
	context?: SdlContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
}

export interface SdlCommandInfo {
	name: string;
	description: string;
}

export interface SdlCliContext {
	context: SdlContext;
	cwd: string;
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

const VERSION = "0.1.0";

const COMMAND_SUMMARIES = {
	cp: "Create a checkpoint commit for the current diff.",
} as const;

export function buildCli(): ClinkrGroup<SdlCliContext> {
	const group = new ClinkrGroup<SdlCliContext>({
		name: "sdl",
		description: "Source Development Lifecycle tools.",
		version: VERSION,
		runtimeInfo: () => "runtime: typescript\nentry_point: @asdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n",
	});

	group.command(
		rawCommand({
			name: "cp",
			description: `Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for the checkpoint message. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`,
			summary: COMMAND_SUMMARIES.cp,
			schema: z.object({}),
			run: async (ctx) => {
				const result = await runCheckpointCommand({
					cwd: ctx.cwd,
					env: ctx.env,
					gateway: ctx.context.checkpoint,
					textGeneration: ctx.context.textGeneration,
				});
				writeCommandResultOutput(result, ctx);
				return result.exitCode;
			},
		}),
	);

	return group;
}

export function listSdlCommands(): SdlCommandInfo[] {
	return Object.entries(COMMAND_SUMMARIES).map(([name, description]) => ({ name, description }));
}

export async function runCli(args: readonly string[], deps: SdlCliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const context = deps.context ?? createRealSdlContext();
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const contextWithIO: SdlCliContext = { context, cwd, env, stdout, stderr };
	const io = resolveIo({ stdout, stderr });
	return buildCli().run(args, { context: contextWithIO, io });
}

function writeCommandResultOutput(result: { stdout: string; stderr: string }, deps: Pick<SdlCliContext, "stdout" | "stderr">): void {
	if (result.stdout !== "") {
		deps.stdout(result.stdout);
	}
	if (result.stderr !== "") {
		deps.stderr(result.stderr);
	}
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}

#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, isClinkrHumanOutputInvocation, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealSlotContext, type SlotCliContext } from "./context.ts";
import { checkoutRequestSchema, checkoutResultSchema, renderCheckout, runCheckout } from "./operations/checkout.ts";
import { claimRequestSchema, claimResultSchema, renderClaim, runClaim } from "./operations/claim.ts";
import { freeRequestSchema, freeResultSchema, renderFree, runFree } from "./operations/free.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import { gotoRequestSchema, gotoResultSchema, renderGoto, runGoto } from "./operations/goto.ts";
import { initRequestSchema, initResultSchema, renderInit, runInit } from "./operations/init.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";
import { renderResize, resizeRequestSchema, resizeResultSchema, runResize } from "./operations/resize.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
	context?: SlotCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
}

export function buildCli(): ClinkrGroup<SlotCliContext> {
	const root = new ClinkrGroup<SlotCliContext>({
		name: "slot",
		description: "Manage the pool of Git-worktree-backed slots.",
		version: VERSION,
		runtimeInfo,
	});
	root.command({
		name: "list",
		description: "List worktree pool slots derived from Git worktree state.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "ls",
		description: "Alias for list.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
	root.command({
		name: "checkout",
		description: "Check out a branch into an available pool slot worktree.",
		schema: checkoutRequestSchema,
		positionals: { branch_name: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "co",
		description: "Alias for checkout.",
		schema: checkoutRequestSchema,
		positionals: { branch_name: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "goto",
		description: "Print/copy a cd command for an assigned slot.",
		schema: gotoRequestSchema,
		options: { num: { short: "-n" }, wt: { short: "-w" } },
		resultSchema: gotoResultSchema,
		handler: runGoto,
		renderHuman: renderGoto,
	});
	root.command({
		name: "claim",
		description: "Move a local branch into the current managed slot or lowest available slot.",
		schema: claimRequestSchema,
		positionals: { branch_name: { position: 0 } },
		resultSchema: claimResultSchema,
		handler: runClaim,
		renderHuman: renderClaim,
	});
	root.command({
		name: "free",
		description: "Free assigned slots back to the pool.",
		schema: freeRequestSchema,
		options: { num: { short: "-n" }, wt: { short: "-w" }, branch: { short: "-b" }, current: { short: "-c" }, yes: { short: "-y" } },
		resultSchema: freeResultSchema,
		handler: runFree,
		renderHuman: renderFree,
	});
	root.command({
		name: "gc",
		description: "Free slots whose pull requests have closed or merged.",
		schema: gcRequestSchema,
		options: { force: { short: "-f" } },
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
	root.command({ 
		name: "init",
		description: "Initialize the worktree pool with N detached slots at trunk.",
		schema: initRequestSchema,
		options: { size: {} },
		resultSchema: initResultSchema,
		handler: runInit,
		renderHuman: renderInit,
	});
	root.command({
		name: "resize",
		description: "Grow or shrink the worktree pool to --size slots.",
		schema: resizeRequestSchema,
		options: { size: {} },
		resultSchema: resizeResultSchema,
		handler: runResize,
		renderHuman: renderResize,
	});
	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;
	const context = deps.context ?? await createRealSlotContext({ cwd, env });
	const runContext: SlotCliContext = { ...context, cwd, env: deps.env ?? context.env, stdin: deps.stdin ?? context.stdin, stderr: deps.stderr ?? context.stderr, shouldWriteCdDirective: isClinkrHumanOutputInvocation(args) };
	return await buildCli().run(args, { context: runContext, io });
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/slot bin slot -> ts/packages/slot/src/cli.ts\n";
}


if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}

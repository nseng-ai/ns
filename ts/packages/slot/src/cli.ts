#!/usr/bin/env node

import {
	ClinkrGroup,
	isClinkrHumanOutputInvocation,
	resolveClinkrInteraction,
	type ClinkrInteraction,
} from "@sdl/clinkr";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdinLine } from "@sdl/core/stdin";

import { createRealSlotContext, type SlotCliContext } from "./context.ts";
import {
	checkoutRequestSchema,
	checkoutResultSchema,
	renderCheckout,
	runCheckout,
} from "./operations/checkout.ts";
import {
	claimRequestSchema,
	claimResultSchema,
	renderClaim,
	runClaim,
} from "./operations/claim.ts";
import {
	completionInstallRequestSchema,
	completionInstallResultSchema,
	completionShowRequestSchema,
	completionShowResultSchema,
	renderCompletionInstall,
	renderCompletionShow,
	runCompletionInstall,
	runCompletionShow,
} from "./operations/completion.ts";
import { freeRequestSchema, freeResultSchema, renderFree, runFree } from "./operations/free.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import {
	gtDownRequestSchema,
	gtDownResultSchema,
	renderGtDownNavigation,
	runGtDown,
} from "./operations/gt/down.ts";
import {
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	renderGtFreeStack,
	runGtFreeStack,
} from "./operations/gt/free-stack.ts";
import {
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	renderStackBranches,
	runGtStackBranches,
} from "./operations/gt/exec/stack-branches.ts";
import {
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	renderStackMapBranches,
	runGtStackMapBranches,
} from "./operations/gt/exec/stack-map-branches.ts";
import {
	gtNavigationResultSchema,
	gtUpRequestSchema,
	renderGtUpNavigation,
	runGtUp,
} from "./operations/gt/up.ts";
import { gotoRequestSchema, gotoResultSchema, renderGoto, runGoto } from "./operations/goto.ts";
import { initRequestSchema, initResultSchema, renderInit, runInit } from "./operations/init.ts";
import { listRequestSchema, listResultSchema, renderList, runList } from "./operations/list.ts";
import {
	renderResize,
	resizeRequestSchema,
	resizeResultSchema,
	runResize,
} from "./operations/resize.ts";
import {
	renderShellInstall,
	renderShellShow,
	runShellInstall,
	runShellShow,
	shellInstallRequestSchema,
	shellInstallResultSchema,
	shellShowRequestSchema,
	shellShowResultSchema,
} from "./operations/shell.ts";

const entry = defineCli<SlotCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: slotCliDescription(),
	sortChildren: true,
	prepareRun: async ({ args, deps, cwd, env, io }) => {
		const context = deps.context ?? (await createRealSlotContext({ cwd, env }));
		const runContext: SlotCliContext = {
			...context,
			cwd,
			env: deps.env ?? context.env,
			interaction: resolveClinkrInteraction({
				interaction: deps.interaction,
				stdin: deps.stdin ?? readStdinLine,
				stderr: io.stderr,
			}),
			stderr: io.stderr,
			shouldWriteCdDirective: isClinkrHumanOutputInvocation(args),
		};
		return { type: "run", context: runContext, buildState: undefined };
	},
	configureCli: ({ root }) => {
		configureSlotCommands(root);
	},
});

export const VERSION = entry.version;

export interface CliDeps {
	context?: SlotCliContext | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string | null>) | undefined;
	interaction?: ClinkrInteraction | undefined;
}

export function buildCli(): ClinkrGroup<SlotCliContext> {
	return entry.buildCli(undefined);
}

export function buildSlotCommandGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const group = new ClinkrGroup<TContext>({
		name: "slot",
		description: slotCliDescription(),
		sortChildren: true,
	});
	configureSlotCommands(group);
	return group;
}

function slotCliDescription(): string {
	return [
		"Manage reusable Git worktree slots for parallel branch work.",
		"",
		"Common flow: slot list → slot checkout <branch> → slot goto --wt <slot> → slot free --current.",
		"Use `slot shell install` to make goto/checkout change your parent shell directory.",
	].join("\n");
}

function configureSlotCommands<TContext extends SlotCliContext>(root: ClinkrGroup<TContext>): void {
	root.command({
		name: "checkout",
		description: "Assign a branch to the lowest available slot and print a cd target.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.command({
		name: "claim",
		description: "Move a local branch into this managed slot or the lowest available slot.",
		schema: claimRequestSchema,
		positionals: { branchName: { position: 0 } },
		resultSchema: claimResultSchema,
		handler: runClaim,
		renderHuman: renderClaim,
	});
	root.command({
		name: "co",
		description: "Alias for checkout.",
		schema: checkoutRequestSchema,
		positionals: { branchName: { position: 0 }, base: { position: 1 } },
		options: { new: { short: "-b" } },
		resultSchema: checkoutResultSchema,
		handler: runCheckout,
		renderHuman: renderCheckout,
	});
	root.group(buildCompletionGroup());
	root.command({
		name: "free",
		description: "Detach assigned slots and return them to the available pool.",
		schema: freeRequestSchema,
		options: {
			num: { short: "-n" },
			wt: { short: "-w" },
			branch: { short: "-b" },
			current: { short: "-c" },
			yes: { short: "-y" },
		},
		resultSchema: freeResultSchema,
		handler: runFree,
		renderHuman: renderFree,
	});
	root.command({
		name: "gc",
		description: "Free slots for branches whose GitHub pull requests are closed or merged.",
		schema: gcRequestSchema,
		options: { force: { short: "-f" } },
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
	root.command({
		name: "goto",
		description: "Print or copy a cd command for an assigned slot.",
		schema: gotoRequestSchema,
		options: { num: { short: "-n" }, wt: { short: "-w" } },
		resultSchema: gotoResultSchema,
		handler: runGoto,
		renderHuman: renderGoto,
	});
	root.group(buildGtGroup());
	root.command({
		name: "init",
		description: "Create the initial detached slot pool at trunk.",
		schema: initRequestSchema,
		options: { size: {} },
		resultSchema: initResultSchema,
		handler: runInit,
		renderHuman: renderInit,
	});
	root.command({
		name: "list",
		description: "Show assigned and available slots derived from Git worktrees.",
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
		name: "resize",
		description: "Grow or shrink the detached slot pool.",
		schema: resizeRequestSchema,
		options: { size: {} },
		resultSchema: resizeResultSchema,
		handler: runResize,
		renderHuman: renderResize,
	});
	root.group(buildShellGroup());
}

function buildShellGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const shell = new ClinkrGroup<TContext>({
		name: "shell",
		description: "Show or install parent-shell integration.",
	});
	shell.command({
		name: "show",
		description: "Print the parent-shell wrapper script.",
		schema: shellShowRequestSchema,
		options: { shell: {} },
		resultSchema: shellShowResultSchema,
		handler: runShellShow,
		renderHuman: renderShellShow,
	});
	shell.command({
		name: "install",
		description: "Install the parent-shell wrapper in the detected or selected rc file.",
		schema: shellInstallRequestSchema,
		options: { shell: {} },
		resultSchema: shellInstallResultSchema,
		handler: runShellInstall,
		renderHuman: renderShellInstall,
	});
	return shell;
}

function buildCompletionGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const completion = new ClinkrGroup<TContext>({
		name: "completion",
		description: "Show or install shell completion.",
	});
	completion.command({
		name: "show",
		description: "Print the shell completion script.",
		schema: completionShowRequestSchema,
		options: { shell: {} },
		resultSchema: completionShowResultSchema,
		handler: runCompletionShow,
		renderHuman: renderCompletionShow,
	});
	completion.command({
		name: "install",
		description: "Install shell completion in the detected or selected rc file.",
		schema: completionInstallRequestSchema,
		options: { shell: {} },
		resultSchema: completionInstallResultSchema,
		handler: runCompletionInstall,
		renderHuman: renderCompletionInstall,
	});
	return completion;
}

function buildGtGroup<TContext extends SlotCliContext>(): ClinkrGroup<TContext> {
	const gt = new ClinkrGroup<TContext>({
		name: "gt",
		description:
			"Navigate and free Graphite-aware slot stacks; metadata-backed stack commands require the sqlite3 CLI.",
	});
	gt.command({
		name: "up",
		description: "Print/copy a cd command for the immediate upstack Graphite branch.",
		schema: gtUpRequestSchema,
		resultSchema: gtNavigationResultSchema,
		handler: runGtUp,
		renderHuman: renderGtUpNavigation,
	});
	gt.command({
		name: "down",
		description: "Print/copy a cd command for the immediate downstack Graphite branch.",
		schema: gtDownRequestSchema,
		resultSchema: gtDownResultSchema,
		handler: runGtDown,
		renderHuman: renderGtDownNavigation,
	});
	gt.command({
		name: "free-stack",
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
		schema: gtFreeStackRequestSchema,
		resultSchema: gtFreeStackResultSchema,
		handler: runGtFreeStack,
		renderHuman: renderGtFreeStack,
	});
	const exec = new ClinkrGroup<TContext>({
		name: "exec",
		description: "Skill-invoked Graphite operations.",
		isHidden: true,
	});
	exec.command({
		name: "stack-branches",
		description: "Emit the current Graphite stack branch list for skill/agent invocation.",
		schema: gtStackBranchesRequestSchema,
		resultSchema: gtStackBranchesResultSchema,
		handler: runGtStackBranches,
		renderHuman: renderStackBranches,
	});
	exec.command({
		name: "stack-map-branches",
		description: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		schema: gtStackMapBranchesRequestSchema,
		resultSchema: gtStackMapBranchesResultSchema,
		handler: runGtStackMapBranches,
		renderHuman: renderStackMapBranches,
	});
	gt.group(exec);
	return gt;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });

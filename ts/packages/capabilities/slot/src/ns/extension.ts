import {
	failure,
	ok,
	requireInteractiveOrUsageError,
	type ClinkrDynamicCompletionRequest,
} from "@ns/clinkr";
import { optionalEntry } from "@ns/core/primitives";
import { createNsDomainCommand, type NsDomainCommandOptions } from "@ns/capability-kit/ns-command";
import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@ns/capability-kit/shell-support";
import { z } from "zod";

import {
	defineExtension,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@ns/kernel/sdk";

import {
	checkoutOptionSpecs,
	foreachOptionSpecs,
	freeOptionSpecs,
	gcOptionSpecs,
	gotoOptionSpecs,
	gtFreeStackOptionSpecs,
	gtNavigationOptionSpecs,
	shellInstallOptionSpecs,
	shellShowOptionSpecs,
	sizeOptionSpecs,
} from "../core/command-options.ts";
import { createRealSlotContext, type SlotCliContext } from "../core/context.ts";
import {
	checkoutRequestSchema,
	checkoutResultSchema,
	claimRequestSchema,
	claimResultSchema,
	foreachRequestSchema,
	foreachResultSchema,
	freeRequestSchema,
	freeResultSchema,
	gcRequestSchema,
	gcResultSchema,
	gotoRequestSchema,
	gotoResultSchema,
	gtDownRequestSchema,
	gtDownResultSchema,
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	gtNavigationResultSchema,
	gtQuiescenceRequestSchema,
	gtQuiescenceResultSchema,
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	gtUpRequestSchema,
	initRequestSchema,
	initResultSchema,
	listRequestSchema,
	listResultSchema,
	renderCheckout,
	renderClaim,
	renderForeach,
	renderFree,
	renderGc,
	renderGoto,
	renderGtDownNavigation,
	renderGtFreeStack,
	renderGtQuiescence,
	renderGtUpNavigation,
	renderInit,
	renderList,
	renderResize,
	renderStackBranches,
	renderStackMapBranches,
	resizeRequestSchema,
	resizeResultSchema,
	runCheckout,
	runClaim,
	runForeach,
	runFree,
	runGc,
	runGoto,
	runGtDown,
	runGtFreeStack,
	runGtQuiescence,
	runGtStackBranches,
	runGtStackMapBranches,
	runGtUp,
	runInit,
	runList,
	runResize,
} from "../lifecycle/operations/index.ts";

const nsShellIntegrationBeginMarker = "# >>> ns shell integration >>>";
const nsShellIntegrationEndMarker = "# <<< ns shell integration <<<";
const nsShellShowRequestSchema = markerSurfaceShowRequestSchema;
const nsShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
const nsShellShowResultSchema = markerSurfaceShowResultSchema;
const nsShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

type SlotNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SlotCliContext>,
	"createContext"
>;

function slotCommand<S extends NsCommandSchema, T>(
	options: SlotNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createSlotExtensionContext,
	});
}

async function createSlotExtensionContext(ctx: NsExtensionApi): Promise<SlotCliContext> {
	return await createRealSlotContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...optionalEntry("stderr", ctx.stderr),
		renderCapabilities: ctx.renderCapabilities,
		...optionalEntry("extensions", ctx.extensions),
		shouldWriteCdDirective: true,
	});
}

async function completeCheckoutBranches(
	ctx: NsExtensionApi,
	request: ClinkrDynamicCompletionRequest,
) {
	if (request.current.startsWith("-")) return { candidates: [] };
	if (request.positionalIndex !== 0 && request.positionalIndex !== 1) return { candidates: [] };
	const slotContext = await createSlotExtensionContext(ctx);
	const branches = await slotContext.git.listLocalBranches();
	return {
		candidates: branches
			.filter((branch) => branch.startsWith(request.current))
			.map((branch) => ({ value: branch, type: "positional-value" as const })),
	};
}

function renderNsShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "ns" });
}

async function runNsShellShow(
	ctx: NsExtensionApi,
	request: z.output<typeof nsShellShowRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderNsShellWrapperScript() });
}

async function runNsShellInstall(
	ctx: NsExtensionApi,
	request: z.output<typeof nsShellInstallRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		if (ctx.confirm === undefined) {
			const gate = requireInteractiveOrUsageError(
				{ isInteractive: () => false, confirm: async () => ({ type: "aborted" as const }) },
				{
					message: "Installing ns shell integration requires --yes when non-interactive.",
					missingFlag: "--yes",
					howToSupply: "Pass --yes (or -y) to update the shell rc file without prompting.",
				},
			);
			if (gate) return gate;
		}
		const confirmed = await ctx.confirm?.(
			"Install ns shell integration?",
			`Install ns shell integration for ${selected.shell} in ${rcPath}?`,
		);
		if (confirmed !== true) {
			return ok({
				shell: selected.shell,
				rcPath,
				isAlreadyInstalled: false,
				cancelled: true,
			});
		}
	}
	const installed = await installMarkerBlock({
		rcPath,
		beginMarker: nsShellIntegrationBeginMarker,
		payload: renderNsShellWrapperScript(),
		endMarker: nsShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

function renderNsShellShow(result: unknown): string {
	const parsed = nsShellShowResultSchema.parse(result);
	return parsed.script;
}

function renderNsShellInstall(result: unknown): string {
	const parsed = nsShellInstallResultSchema.parse(result);
	if (parsed.cancelled)
		return `Cancelled ns shell integration install for ${parsed.shell} in ${parsed.rcPath}`;
	if (parsed.isAlreadyInstalled)
		return `ns shell integration already installed in ${parsed.rcPath}`;
	return `Installed ns shell integration for ${parsed.shell} in ${parsed.rcPath}`;
}

export default defineExtension({
	commands: [
		slotCommand({
			name: "list",
			summary: "List worktree pool slots derived from Git worktree state.",
			description: "List worktree pool slots derived from Git worktree state.",
			schema: listRequestSchema,
			resultSchema: listResultSchema,
			renderHuman: renderList,
			handler: runList,
		}),
		slotCommand({
			name: "ls",
			summary: "Alias for list.",
			description: "Alias for list.",
			schema: listRequestSchema,
			resultSchema: listResultSchema,
			renderHuman: renderList,
			handler: runList,
		}),
		slotCommand({
			name: "checkout",
			summary: "Check out a branch into an available pool slot worktree.",
			description: "Check out a branch into an available pool slot worktree.",
			schema: checkoutRequestSchema,
			positionals: { branchName: { position: 0 }, base: { position: 1 } },
			options: checkoutOptionSpecs,
			completionProvider: completeCheckoutBranches,
			resultSchema: checkoutResultSchema,
			renderHuman: renderCheckout,
			handler: runCheckout,
		}),
		slotCommand({
			name: "co",
			summary: "Alias for checkout.",
			description: "Alias for checkout.",
			schema: checkoutRequestSchema,
			positionals: { branchName: { position: 0 }, base: { position: 1 } },
			options: checkoutOptionSpecs,
			completionProvider: completeCheckoutBranches,
			resultSchema: checkoutResultSchema,
			renderHuman: renderCheckout,
			handler: runCheckout,
		}),
		slotCommand({
			name: "goto",
			summary: "Print/copy a cd command for a slot worktree.",
			description: "Print/copy a cd command for a slot worktree.",
			schema: gotoRequestSchema,
			options: gotoOptionSpecs,
			resultSchema: gotoResultSchema,
			renderHuman: renderGoto,
			handler: runGoto,
		}),
		slotCommand({
			name: "claim",
			summary: "Move a local branch into the current managed slot or lowest available slot.",
			description: "Move a local branch into the current managed slot or lowest available slot.",
			schema: claimRequestSchema,
			positionals: { branchName: { position: 0 } },
			resultSchema: claimResultSchema,
			renderHuman: renderClaim,
			handler: runClaim,
		}),
		slotCommand({
			name: "free",
			summary: "Free assigned slots back to the pool.",
			description: "Free assigned slots back to the pool.",
			schema: freeRequestSchema,
			options: freeOptionSpecs,
			resultSchema: freeResultSchema,
			renderHuman: renderFree,
			handler: runFree,
		}),
		slotCommand({
			name: "foreach",
			summary: "Run a command in every managed slot worktree.",
			description: "Run a command in every managed slot worktree.",
			schema: foreachRequestSchema,
			positionals: { command: { position: 0 } },
			options: foreachOptionSpecs,
			resultSchema: foreachResultSchema,
			renderHuman: renderForeach,
			handler: runForeach,
		}),
		slotCommand({
			name: "gc",
			summary: "Free slots whose pull requests have closed or merged.",
			description: "Free slots whose pull requests have closed or merged.",
			schema: gcRequestSchema,
			options: gcOptionSpecs,
			resultSchema: gcResultSchema,
			renderHuman: renderGc,
			handler: runGc,
		}),
		slotCommand({
			name: "init",
			summary: "Initialize the worktree pool with N detached slots at trunk.",
			description: "Initialize the worktree pool with N detached slots at trunk.",
			schema: initRequestSchema,
			options: sizeOptionSpecs,
			resultSchema: initResultSchema,
			renderHuman: renderInit,
			handler: runInit,
		}),
		slotCommand({
			name: "resize",
			summary: "Grow or shrink the worktree pool to --size slots.",
			description: "Grow or shrink the worktree pool to --size slots.",
			schema: resizeRequestSchema,
			options: sizeOptionSpecs,
			resultSchema: resizeResultSchema,
			renderHuman: renderResize,
			handler: runResize,
		}),
		slotCommand({
			name: "up",
			summary: "Print/copy a cd command for the immediate upstack Graphite branch.",
			description: "Print/copy a cd command for the immediate upstack Graphite branch.",
			schema: gtUpRequestSchema,
			options: gtNavigationOptionSpecs,
			resultSchema: gtNavigationResultSchema,
			renderHuman: renderGtUpNavigation,
			handler: runGtUp,
		}),
		slotCommand({
			name: "down",
			summary: "Print/copy a cd command for the immediate downstack Graphite branch.",
			description: "Print/copy a cd command for the immediate downstack Graphite branch.",
			schema: gtDownRequestSchema,
			options: gtNavigationOptionSpecs,
			resultSchema: gtDownResultSchema,
			renderHuman: renderGtDownNavigation,
			handler: runGtDown,
		}),
		slotCommand({
			name: "free-stack",
			summary:
				"Release every assigned slot in the current Graphite stack except the current branch.",
			description:
				"Release every assigned slot in the current Graphite stack except the current branch.",
			schema: gtFreeStackRequestSchema,
			options: gtFreeStackOptionSpecs,
			resultSchema: gtFreeStackResultSchema,
			renderHuman: renderGtFreeStack,
			handler: runGtFreeStack,
		}),
		slotCommand({
			name: "stack-branches",
			summary: "Emit the current Graphite stack branch list for skill/agent invocation.",
			description: "Emit the current Graphite stack branch list for skill/agent invocation.",
			schema: gtStackBranchesRequestSchema,
			resultSchema: gtStackBranchesResultSchema,
			renderHuman: renderStackBranches,
			handler: runGtStackBranches,
		}),
		slotCommand({
			name: "stack-map-branches",
			summary: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
			description:
				"Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
			schema: gtStackMapBranchesRequestSchema,
			resultSchema: gtStackMapBranchesResultSchema,
			renderHuman: renderStackMapBranches,
			handler: runGtStackMapBranches,
		}),
		slotCommand({
			name: "quiescence",
			summary: "Preflight whether the current Graphite stack scope is safe to mutate.",
			description: "Preflight whether the current Graphite stack scope is safe to mutate.",
			schema: gtQuiescenceRequestSchema,
			resultSchema: gtQuiescenceResultSchema,
			renderHuman: renderGtQuiescence,
			handler: runGtQuiescence,
		}),
		{
			name: "show",
			summary: "Print the parent-shell wrapper script.",
			description: "Print the parent-shell wrapper script.",
			schema: nsShellShowRequestSchema,
			options: shellShowOptionSpecs,
			resultSchema: nsShellShowResultSchema,
			renderHuman: renderNsShellShow,
			run: runNsShellShow,
		},
		{
			name: "install",
			summary: "Install the parent-shell wrapper in the detected or selected rc file.",
			description: "Install the parent-shell wrapper in the detected or selected rc file.",
			schema: nsShellInstallRequestSchema,
			options: shellInstallOptionSpecs,
			resultSchema: nsShellInstallResultSchema,
			renderHuman: renderNsShellInstall,
			run: runNsShellInstall,
		},
	],
});

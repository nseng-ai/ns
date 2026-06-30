import {
	failure,
	ok,
	requireInteractiveOrUsageError,
	type ClinkrDynamicCompletionRequest,
} from "@sdl/clinkr";
import {
	createSdlDomainCommand,
	type SdlDomainCommandOptions,
} from "@sdl/capability-kit/sdl-command";
import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@sdl/capability-kit/shell-support";
import { z } from "zod";

import {
	defineExtension,
	type SdlCommand,
	type SdlCommandSchema,
	type SdlExtensionApi,
} from "sdl-sdk";

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
	foreachRequestSchema,
	foreachResultSchema,
	renderForeach,
	runForeach,
} from "./operations/foreach.ts";
import { freeRequestSchema, freeResultSchema, renderFree, runFree } from "./operations/free.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "./operations/gc.ts";
import {
	gtDownRequestSchema,
	gtDownResultSchema,
	renderGtDownNavigation,
	runGtDown,
} from "./operations/gt/down.ts";
import {
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	renderStackBranches,
	runGtStackBranches,
} from "./operations/gt/exec/stack-branches.ts";
import {
	gtQuiescenceRequestSchema,
	gtQuiescenceResultSchema,
	renderGtQuiescence,
	runGtQuiescence,
} from "./operations/gt/exec/quiescence.ts";
import {
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	renderStackMapBranches,
	runGtStackMapBranches,
} from "./operations/gt/exec/stack-map-branches.ts";
import {
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	renderGtFreeStack,
	runGtFreeStack,
} from "./operations/gt/free-stack.ts";
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

const sdlShellIntegrationBeginMarker = "# >>> sdl shell integration >>>";
const sdlShellIntegrationEndMarker = "# <<< sdl shell integration <<<";
const sdlShellShowRequestSchema = markerSurfaceShowRequestSchema;
const sdlShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
const sdlShellShowResultSchema = markerSurfaceShowResultSchema;
const sdlShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

type SlotSdlCommandOptions<S extends SdlCommandSchema, T> = Omit<
	SdlDomainCommandOptions<S, T, SlotCliContext>,
	"createContext"
>;

function slotCommand<S extends SdlCommandSchema, T>(
	options: SlotSdlCommandOptions<S, T>,
): SdlCommand<S, T> {
	return createSdlDomainCommand({
		...options,
		createContext: createSlotExtensionContext,
	});
}

async function createSlotExtensionContext(ctx: SdlExtensionApi): Promise<SlotCliContext> {
	return await createRealSlotContext({
		cwd: ctx.cwd,
		env: ctx.env,
		...(ctx.stderr === undefined ? {} : { stderr: ctx.stderr }),
		renderCapabilities: ctx.renderCapabilities,
		...(ctx.extensions === undefined ? {} : { extensions: ctx.extensions }),
		shouldWriteCdDirective: true,
	});
}

async function completeCheckoutBranches(
	ctx: SdlExtensionApi,
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

function renderSdlShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "sdl" });
}

async function runSdlShellShow(
	ctx: SdlExtensionApi,
	request: z.output<typeof sdlShellShowRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderSdlShellWrapperScript() });
}

async function runSdlShellInstall(
	ctx: SdlExtensionApi,
	request: z.output<typeof sdlShellInstallRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		if (ctx.confirm === undefined) {
			const gate = requireInteractiveOrUsageError(
				{ isInteractive: () => false, confirm: async () => ({ type: "aborted" as const }) },
				{
					message: "Installing sdl shell integration requires --yes when non-interactive.",
					missingFlag: "--yes",
					howToSupply: "Pass --yes (or -y) to update the shell rc file without prompting.",
				},
			);
			if (gate) return gate;
		}
		const confirmed = await ctx.confirm?.(
			"Install sdl shell integration?",
			`Install sdl shell integration for ${selected.shell} in ${rcPath}?`,
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
		beginMarker: sdlShellIntegrationBeginMarker,
		payload: renderSdlShellWrapperScript(),
		endMarker: sdlShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

function renderSdlShellShow(result: unknown): string {
	const parsed = sdlShellShowResultSchema.parse(result);
	return parsed.script;
}

function renderSdlShellInstall(result: unknown): string {
	const parsed = sdlShellInstallResultSchema.parse(result);
	if (parsed.cancelled)
		return `Cancelled sdl shell integration install for ${parsed.shell} in ${parsed.rcPath}`;
	if (parsed.isAlreadyInstalled)
		return `sdl shell integration already installed in ${parsed.rcPath}`;
	return `Installed sdl shell integration for ${parsed.shell} in ${parsed.rcPath}`;
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
			completionProvider: completeCheckoutBranches,
			resultSchema: checkoutResultSchema,
			renderHuman: renderCheckout,
			handler: runCheckout,
		}),
		slotCommand({
			name: "goto",
			summary: "Print/copy a cd command for an assigned slot.",
			description: "Print/copy a cd command for an assigned slot.",
			schema: gotoRequestSchema,
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
			resultSchema: foreachResultSchema,
			renderHuman: renderForeach,
			handler: runForeach,
		}),
		slotCommand({
			name: "gc",
			summary: "Free slots whose pull requests have closed or merged.",
			description: "Free slots whose pull requests have closed or merged.",
			schema: gcRequestSchema,
			resultSchema: gcResultSchema,
			renderHuman: renderGc,
			handler: runGc,
		}),
		slotCommand({
			name: "init",
			summary: "Initialize the worktree pool with N detached slots at trunk.",
			description: "Initialize the worktree pool with N detached slots at trunk.",
			schema: initRequestSchema,
			resultSchema: initResultSchema,
			renderHuman: renderInit,
			handler: runInit,
		}),
		slotCommand({
			name: "resize",
			summary: "Grow or shrink the worktree pool to --size slots.",
			description: "Grow or shrink the worktree pool to --size slots.",
			schema: resizeRequestSchema,
			resultSchema: resizeResultSchema,
			renderHuman: renderResize,
			handler: runResize,
		}),
		slotCommand({
			name: "up",
			summary: "Print/copy a cd command for the immediate upstack Graphite branch.",
			description: "Print/copy a cd command for the immediate upstack Graphite branch.",
			schema: gtUpRequestSchema,
			resultSchema: gtNavigationResultSchema,
			renderHuman: renderGtUpNavigation,
			handler: runGtUp,
		}),
		slotCommand({
			name: "down",
			summary: "Print/copy a cd command for the immediate downstack Graphite branch.",
			description: "Print/copy a cd command for the immediate downstack Graphite branch.",
			schema: gtDownRequestSchema,
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
			schema: sdlShellShowRequestSchema,
			resultSchema: sdlShellShowResultSchema,
			renderHuman: renderSdlShellShow,
			run: runSdlShellShow,
		},
		{
			name: "install",
			summary: "Install the parent-shell wrapper in the detected or selected rc file.",
			description: "Install the parent-shell wrapper in the detected or selected rc file.",
			schema: sdlShellInstallRequestSchema,
			resultSchema: sdlShellInstallResultSchema,
			renderHuman: renderSdlShellInstall,
			run: runSdlShellInstall,
		},
	],
});

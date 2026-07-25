import type { Clock } from "@nseng-ai/foundation/clock";
import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
	objectiveSelectionHostFromExec,
	type ObjectiveSelectionSpec,
} from "@nseng-ai/objectives/api";

import {
	formatObjectiveSidebarLabel,
	resolveObjectiveSelector,
	validateObjectiveSidebarSlug,
} from "./objective-sidebar.ts";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { slotLabelInput } from "./workspace-label.ts";

const PI_SIDEBAR_STATUS_KEY = "pi:herdr-sidebar";
const OBJECTIVE_SIDEBAR_SELECTION_SPEC = {
	statusKey: PI_SIDEBAR_STATUS_KEY,
	selectionTitle: "Select an active Objective for Herdr sidebar",
	selectionMode: "compact-diff-suggestion",
} satisfies ObjectiveSelectionSpec;

export interface HerdrSidebarController {
	handleObjectiveCommand(args: string, ctx: CommandContext): Promise<void>;
}

export interface HerdrSidebarControllerOptions {
	clock?: Clock;
}

export function createHerdrSidebarController(
	pi: HerdrPiCommandApi,
	herdr: HerdrGateway,
	options: HerdrSidebarControllerOptions = {},
): HerdrSidebarController {
	return {
		async handleObjectiveCommand(args, ctx): Promise<void> {
			await handleDeterministicObjectiveSidebar(pi, herdr, args, ctx, options);
		},
	};
}

/**
 * Read the Herdr workspace ID from the caller environment.
 *
 * The `HERDR_WORKSPACE_ID` environment variable is injected by Herdr into
 * every managed pane. This is the stable caller-targeting mechanism; do not
 * fall back to UI focus.
 */
export function getCallerWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return trimmedEnvValue(env.HERDR_WORKSPACE_ID);
}

/** Read the exact caller tab injected by Herdr; whitespace-only values are absent. */
export function getCallerTabId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return trimmedEnvValue(env.HERDR_TAB_ID);
}

function trimmedEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

async function handleDeterministicObjectiveSidebar(
	pi: HerdrPiCommandApi,
	herdr: HerdrGateway,
	args: string,
	ctx: CommandContext,
	options: HerdrSidebarControllerOptions,
): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a Herdr caller workspace.", "warning");
		return;
	}

	const slug = await resolveObjectiveSidebarSlug(pi, args, ctx, options);
	if (slug === undefined) {
		return;
	}

	setStatus(ctx, "preparing Herdr Objective sidebar…");
	try {
		const validationResult = await validateObjectiveSidebarSlug(pi, ctx.cwd, slug);
		if (validationResult.type === "failed") {
			notify(ctx, validationResult.message, "error");
			return;
		}

		const label = formatObjectiveSidebarLabel({
			objectiveSlug: slug,
			...slotLabelInput(ctx.cwd),
		});
		const renameResult = await herdr.renameWorkspace(workspaceId, label);
		if (renameResult.type === "failed") {
			notify(ctx, renameResult.message, "error");
			return;
		}

		notify(ctx, `Applied Herdr Objective sidebar: ${label}`, "success");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function resolveObjectiveSidebarSlug(
	pi: HerdrPiCommandApi,
	args: string,
	ctx: CommandContext,
	options: HerdrSidebarControllerOptions,
): Promise<string | undefined> {
	if (args.trim().length > 0) {
		const selector = resolveObjectiveSelector(args, ctx.cwd);
		if (selector.type === "invalid") {
			notify(ctx, selector.message, "warning");
			return undefined;
		}
		return selector.slug;
	}

	if (ctx.hasUI !== true || ctx.ui.select === undefined) {
		notify(ctx, "Pass an Objective slug or .ns/objectives/<slug> path.", "warning");
		return undefined;
	}

	return chooseActiveObjectiveSlug(
		objectiveSelectionHostFromExec(pi, options.clock === undefined ? {} : { clock: options.clock }),
		objectiveSelectionContextFromCommandContext(ctx),
		OBJECTIVE_SIDEBAR_SELECTION_SPEC,
	);
}

function notify(
	ctx: { hasUI?: boolean; ui: { notify(message: string, level?: NotifyLevel): void } },
	message: string,
	level: NotifyLevel = "info",
): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI !== false) {
		ctx.ui.setStatus?.(PI_SIDEBAR_STATUS_KEY, value);
	}
}

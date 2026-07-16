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
import type { CommandContext, NotifyLevel } from "@nseng-ai/capability-kit/pi-types";
import { basename, resolve } from "node:path";

import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

const PI_SIDEBAR_STATUS_KEY = "pi:herdr-sidebar";
const OBJECTIVE_SIDEBAR_SELECTION_SPEC = {
	statusKey: PI_SIDEBAR_STATUS_KEY,
	selectionTitle: "Select an active Objective for Herdr sidebar",
	selectionMode: "compact-diff-suggestion",
} satisfies ObjectiveSelectionSpec;

export interface HerdrSidebarController {
	handleObjectiveCommand(args: string, ctx: CommandContext): Promise<void>;
}

export function createHerdrSidebarController(
	pi: HerdrPiCommandApi,
	herdr: HerdrGateway,
): HerdrSidebarController {
	return {
		async handleObjectiveCommand(args, ctx): Promise<void> {
			await handleDeterministicObjectiveSidebar(pi, herdr, args, ctx);
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
	return nonBlankEnvValue(env.HERDR_WORKSPACE_ID);
}

export function getCallerPaneId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return nonBlankEnvValue(env.HERDR_PANE_ID);
}

async function handleDeterministicObjectiveSidebar(
	pi: HerdrPiCommandApi,
	herdr: HerdrGateway,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a Herdr caller workspace.", "warning");
		return;
	}

	const slug = await resolveObjectiveSidebarSlug(pi, args, ctx);
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

		const label = formatObjectiveSidebarLabel({ objectiveSlug: slug });
		const renameResult = await herdr.renameWorkspace(workspaceId, label);
		if (renameResult.type === "failed") {
			notify(ctx, renameResult.message, "error");
			return;
		}

		const paneId = getCallerPaneId();
		if (paneId === undefined) {
			notify(
				ctx,
				"Herdr renamed the workspace, but HERDR_PANE_ID is unavailable for the slot title.",
				"warning",
			);
			return;
		}
		const slotTitle = basename(resolve(ctx.cwd));
		const titleResult = await herdr.reportPaneTitle(paneId, slotTitle);
		if (titleResult.type === "failed") {
			notify(ctx, titleResult.message, "error");
			return;
		}

		notify(ctx, `Applied Herdr Objective sidebar: ${label} / ${slotTitle}`, "success");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function resolveObjectiveSidebarSlug(
	pi: HerdrPiCommandApi,
	args: string,
	ctx: CommandContext,
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
		objectiveSelectionHostFromExec(pi),
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

function nonBlankEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI !== false) {
		ctx.ui.setStatus?.(PI_SIDEBAR_STATUS_KEY, value);
	}
}

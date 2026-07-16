import {
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
	objectiveSelectionHostFromExec,
	type ObjectiveSelectionSpec,
} from "@nseng-ai/objectives/api";

import {
	applyObjectiveSidebarFields,
	formatObjectiveSidebarFields,
	readCurrentBranchSlug,
	resolveObjectiveSelector,
	validateObjectiveSidebarSlug,
	slotSlugFromCwd,
} from "./objective-sidebar.ts";
import type { CommandContext, NotifyLevel } from "@nseng-ai/capability-kit/cmux/types";
import type { CccPiCommandApi } from "./pi-command-api.ts";

const PI_SIDEBAR_STATUS_KEY = "pi:cmux-sidebar";
const OBJECTIVE_SIDEBAR_SELECTION_SPEC = {
	statusKey: PI_SIDEBAR_STATUS_KEY,
	selectionTitle: "Select an active Objective for cmux sidebar",
	selectionMode: "compact-diff-suggestion",
} satisfies ObjectiveSelectionSpec;

export interface CccSidebarController {
	handleObjectiveCommand(args: string, ctx: CommandContext): Promise<void>;
}

export function createCccSidebarController(pi: CccPiCommandApi): CccSidebarController {
	return {
		async handleObjectiveCommand(args, ctx): Promise<void> {
			await handleDeterministicObjectiveSidebar(pi, args, ctx);
		},
	};
}

export function getCallerWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	const value = env.CMUX_WORKSPACE_ID ?? env.CMUX_TAB_ID;
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function handleDeterministicObjectiveSidebar(
	pi: CccPiCommandApi,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		return;
	}

	const slug = await resolveObjectiveSidebarSlug(pi, args, ctx);
	if (slug === undefined) {
		return;
	}

	setStatus(ctx, "preparing cmux Objective sidebar…");
	try {
		const validationResult = await validateObjectiveSidebarSlug(pi, ctx.cwd, slug);
		if (validationResult.type === "failed") {
			notify(ctx, validationResult.message, "error");
			return;
		}

		const branchResult = await readCurrentBranchSlug(pi, ctx.cwd);
		if (branchResult.type === "failed") {
			notify(ctx, branchResult.message, "error");
			return;
		}

		const fields = formatObjectiveSidebarFields({
			objectiveSlug: slug,
			slotSlug: slotSlugFromCwd(ctx.cwd),
			branchSlug: branchResult.branchSlug,
		});
		const applyResult = await applyObjectiveSidebarFields(pi, ctx.cwd, fields);
		if (applyResult.type === "failed") {
			notify(ctx, applyResult.message, "error");
			return;
		}

		notify(ctx, `Applied cmux Objective sidebar: ${fields.title}`, "success");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function resolveObjectiveSidebarSlug(
	pi: CccPiCommandApi,
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

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI !== false) {
		ctx.ui.setStatus?.(PI_SIDEBAR_STATUS_KEY, value);
	}
}

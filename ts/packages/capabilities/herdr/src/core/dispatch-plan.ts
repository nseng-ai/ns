/**
 * Herdr dispatch-plan: attaches the latest session-saved plan to a
 * Graphite-tracked branch via branch-context, then opens the branch either in
 * a new Herdr workspace (workspace:dispatch-plan) or in a focused tab inside
 * the caller's Herdr workspace (surface:dispatch-plan).
 *
 * ns owns: Saved Plan resolution, branch-context creation, slot checkout,
 *          Pi launch command building.
 * Herdr owns: workspace/tab creation, explicit pane targeting, process launch.
 */
import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextCreateOperation,
	buildBranchContextOutputMessage,
	createBranchContextFromFile,
	createRealBranchContextContext,
	derivePlanContentSlug,
	formatBranchContextEvidence,
	formatBranchContextCreateFailure,
	formatBranchContextCreatePreview,
	resolveBranchContextCreatePreviewContext,
	type BranchContextContext,
	type BranchContextContextFactory,
	type BranchContextCreateOperation,
	type BranchContextEvidence,
	type BranchContextOutputDetails,
} from "@nseng-ai/branch-context/api";
import {
	findLatestSessionSavedPlanFile,
	resolvePlanStoreDirectory,
	type PlanStoreDirectoryEvidence,
	type ValidatedSessionSavedPlan,
} from "@nseng-ai/plans/api";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@nseng-ai/capability-kit/cmux/pi-launch";
import type { PiLaunchOptions } from "@nseng-ai/capability-kit/cmux/pi-launch";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext, NotifyLevel } from "@nseng-ai/capability-kit/cmux/types";
import type { SlotClient } from "@nseng-ai/slots/api";
import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/pi";

// Command names are used in the Pi layer (pi/dispatch-plan.ts) via DispatchPlanConfig.
import { openBranchInHerdrWorkspace, openBranchInHerdrCallerTab } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { getCallerWorkspaceId } from "./sidebar.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

const BRANCH_CREATION = "graphite";

export type DispatchDestination = "workspace" | "surface";

export interface DispatchPlanConfig {
	commandName: string;
	statusKey: string;
	destination: DispatchDestination;
}

export interface HerdrSlotDispatchPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: HerdrPiCommandApi, cwd: string]>;
	slotClient?: SlotClient;
}

interface CommandArgs {
	isDryRun: boolean;
	shouldShowHelp: boolean;
}

export interface HandleHerdrSlotDispatchPlanOptions {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
	rawArgs: string;
	ctx: CommandContext;
	options: HerdrSlotDispatchPlanOptions;
	config: DispatchPlanConfig;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotDispatchPlan(
	options: HandleHerdrSlotDispatchPlanOptions,
): Promise<void> {
	const { pi, herdr, rawArgs, ctx, config } = options;

	const parsed = parseCommandArgs(rawArgs);
	if ("error" in parsed) {
		present(ctx, `${parsed.error}\n\n${formatUsage(config)}`, "error");
		return;
	}
	if (parsed.shouldShowHelp) {
		present(ctx, formatUsage(config), "info");
		return;
	}

	options.notifyProgress("Finding latest saved plan…");
	await ctx.waitForIdle();
	setStatus(ctx, config, "finding latest saved plan…");

	try {
		const checkout = await resolveCurrentCheckout(pi, ctx.cwd, options.options);
		if ("error" in checkout) {
			present(ctx, checkout.error, "error");
			return;
		}

		const selected = await resolveLatestSavedPlanFromSession(ctx, checkout);
		if ("error" in selected) {
			present(ctx, selected.error, "error");
			return;
		}

		const selectedPlan = selected.plan;
		setStatus(ctx, config, "deriving branch-context slug…");
		const slugEvidence = await derivePlanContentSlug(pi, {
			filePath: selectedPlan.filePath,
			cwd: checkout.repoRoot,
		});
		const operation = buildBranchContextCreateOperation({
			slug: slugEvidence.slug,
			filePath: selectedPlan.filePath,
			branchCreation: BRANCH_CREATION,
			...optionalEntry("summary", selectedPlan.summary),
		});

		if (parsed.isDryRun) {
			const launchOptions = getPiLaunchOptions(pi, ctx);
			const previewContext = await resolveBranchContextCreatePreviewContext(pi, {
				cwd: checkout.repoRoot,
				context: dispatchBranchContextContext(pi, checkout.repoRoot, options.options),
			});
			const branchContextPreview = formatBranchContextCreatePreview(operation, {
				...previewContext,
				graphiteParentBranch: checkout.sourceBranch,
			});
			presentBranchContextMessage(
				pi,
				ctx,
				formatDryRun({
					plan: selectedPlan,
					checkout,
					operation,
					branchContextPreview,
					launchOptions,
					config,
				}),
				{ status: "dry-run", targetBranch: operation.branch, key: operation.key },
				"info",
			);
			return;
		}

		await createAttachAndLaunch({
			pi,
			herdr,
			ctx,
			checkout,
			operation,
			config,
			dispatchOptions: options.options,
		});
	} catch (error) {
		present(ctx, `/dispatch-plan failed unexpectedly.\n${formatErrorMessage(error)}`, "error");
	} finally {
		setStatus(ctx, config, undefined);
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dispatchBranchContextContext(
	pi: HerdrPiCommandApi,
	cwd: string,
	options: HerdrSlotDispatchPlanOptions,
): BranchContextContext {
	return options.createBranchContextContext?.(pi, cwd) ?? createRealBranchContextContext({ cwd });
}

function parseCommandArgs(rawArgs: string): CommandArgs | { error: string } {
	const tokens = rawArgs
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 0);
	const parsed: CommandArgs = { isDryRun: false, shouldShowHelp: false };
	for (const token of tokens) {
		if (token === "--dry-run") {
			parsed.isDryRun = true;
			continue;
		}
		if (token === "--help" || token === "-h") {
			parsed.shouldShowHelp = true;
			continue;
		}
		if (token.startsWith("-")) return { error: `Unknown flag: ${token}` };
		return { error: `Positional arguments are not supported in v1: ${token}` };
	}
	return parsed;
}

async function resolveLatestSavedPlanFromSession(
	ctx: CommandContext,
	directory: PlanStoreDirectoryEvidence,
): Promise<{ plan: ValidatedSessionSavedPlan } | { error: string }> {
	const result = await findLatestSessionSavedPlanFile(
		ctx.sessionManager?.getBranch?.() ?? [],
		directory,
	);
	switch (result.type) {
		case "found":
			return { plan: result.plan };
		case "unsafe":
			return { error: result.message };
		case "not-found":
			return {
				error: [
					"No saved plan from /ns:plan:save was found in the current session branch.",
					"Run /ns:plan:save first, then rerun the dispatch command.",
				].join("\n"),
			};
	}
}

async function resolveCurrentCheckout(
	pi: HerdrPiCommandApi,
	cwd: string,
	options: HerdrSlotDispatchPlanOptions,
): Promise<PlanStoreDirectoryEvidence | { error: string }> {
	try {
		return await resolvePlanStoreDirectory(pi, {
			cwd,
			...optionalEntry("planStoreRoot", options.planStoreRoot),
		});
	} catch (error) {
		return {
			error: `Could not resolve current repository and source branch.\n${formatErrorMessage(error)}`,
		};
	}
}

async function createAttachAndLaunch(options: {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
	ctx: CommandContext;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	config: DispatchPlanConfig;
	dispatchOptions: HerdrSlotDispatchPlanOptions;
}): Promise<void> {
	const { pi, herdr, ctx, checkout, operation, config, dispatchOptions } = options;

	present(ctx, `Creating Graphite-tracked branch context ${operation.branch}…`, "info");
	setStatus(ctx, config, "creating branch and attaching plan…");

	let evidence: BranchContextEvidence;
	try {
		evidence = await createBranchContextFromFile(pi, operation.params, {
			cwd: checkout.repoRoot,
			context: dispatchBranchContextContext(pi, checkout.repoRoot, dispatchOptions),
		});
	} catch (error) {
		const failure = formatBranchContextCreateFailure(operation, error);
		present(ctx, failure.replace("\n\n", "\nNo Herdr workspace was opened.\n\n"), "error");
		return;
	}

	presentBranchContextMessage(
		pi,
		ctx,
		formatBranchContextEvidence(evidence),
		{ status: "success", evidence },
		"info",
	);

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launchCommand = buildPiLaunchCommand(
		formatImplBranchContextCommand(operation.key),
		launchOptions,
	);
	const slotClient =
		dispatchOptions.slotClient ?? createHerdrSlotClient({ cwd: checkout.repoRoot });

	if (config.destination === "workspace") {
		await openBranchInHerdrWorkspace({
			pi,
			herdr,
			cwd: checkout.repoRoot,
			branchName: operation.branch,
			command: launchCommand,
			description: `herdr dispatch-plan from ${checkout.sourceBranch}`,
			slotClient,
			notify: (message, level) => ctx.ui.notify(message, level),
			onStatus: (message) => setStatus(ctx, config, message),
			successMessage: (target) =>
				[
					"Dispatched plan in Herdr workspace.",
					`Branch: ${operation.branch}`,
					`Slot: ${target.slotName}`,
					`Worktree: ${target.worktreePath}`,
					`Attached plan: ${BRANCH_CONTEXT_NAMESPACE}/${operation.key}`,
					`Command: ${launchCommand}`,
				].join("\n"),
			notifyProgress: () => {},
		});
		return;
	}

	// surface destination: open a tab in the caller's Herdr workspace
	const callerWorkspaceId = getCallerWorkspaceId();
	if (!callerWorkspaceId) {
		ctx.ui.notify(
			"surface:dispatch-plan requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
			"error",
		);
		return;
	}

	setStatus(ctx, config, "opening Herdr tab…");
	const result = await openBranchInHerdrCallerTab({
		pi,
		herdr,
		cwd: checkout.repoRoot,
		branchName: operation.branch,
		callerWorkspaceId,
		command: launchCommand,
		tabTitle: operation.branch,
		slotClient,
		notify: (message, level) => ctx.ui.notify(message, level),
		onStatus: (message) => setStatus(ctx, config, message),
	});

	if (result.type === "opened") {
		present(
			ctx,
			[
				"Dispatched plan in Herdr surface.",
				`Branch: ${operation.branch}`,
				`Slot: ${result.target.slotName}`,
				`Worktree: ${result.target.worktreePath}`,
				`Tab: ${result.tabId}`,
				`Pane: ${result.paneId}`,
				`Attached plan: ${BRANCH_CONTEXT_NAMESPACE}/${operation.key}`,
				`Command: ${launchCommand}`,
			].join("\n"),
			"info",
		);
	}
}

function formatDryRun(options: {
	plan: ValidatedSessionSavedPlan;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	branchContextPreview: string;
	launchOptions: PiLaunchOptions;
	config: DispatchPlanConfig;
}): string {
	const { plan, operation, branchContextPreview, launchOptions, config } = options;
	const launchCommand = buildPiLaunchCommand(
		formatImplBranchContextCommand(operation.key),
		launchOptions,
	);
	return [
		`Dry run: no branch was created, no plan was attached, and no Herdr ${config.destination} was opened.`,
		"",
		"Selected saved plan:",
		`Path: ${plan.filePath}`,
		`Saved-plan filename slug: ${plan.slug}`,
		`Content-derived branch-context slug: ${operation.slug}`,
		`Repo key: ${plan.repoKey}`,
		`Repo root: ${plan.repoRoot}`,
		`Source branch: ${plan.sourceBranch}`,
		plan.summary ? `Summary: ${plan.summary}` : undefined,
		"",
		branchContextPreview,
		launchCommand,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function formatUsage(config: DispatchPlanConfig): string {
	return `Usage: /${config.commandName} [--dry-run]

Dispatch the latest saved plan into a new Herdr ${config.destination} for implementation.

Options:
  --dry-run    Show the selected plan and commands without mutating.
  --help, -h   Show this help.

Run /ns:plan:save first, then rerun /${config.commandName}.`;
}

type PresentLevel = Exclude<NotifyLevel, "success">;

function presentBranchContextMessage(
	pi: HerdrPiCommandApi,
	ctx: CommandContext,
	content: string,
	details: BranchContextOutputDetails,
	level: PresentLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage(buildBranchContextOutputMessage(content, details));
		return;
	}
	present(ctx, content, level);
}

function present(ctx: CommandContext, message: string, level: PresentLevel): void {
	ctx.ui.notify(message, level);
}

function setStatus(
	ctx: CommandContext,
	config: DispatchPlanConfig,
	value: string | undefined,
): void {
	ctx.ui.setStatus?.(config.statusKey, value);
}

/**
 * Herdr dispatch-plan: attaches the latest session-saved plan to a
 * Graphite-tracked branch via branch-context, then opens the branch either in
 * a new Herdr space (space:dispatch-plan) or in a focused tab inside
 * the caller's Herdr space (tab:dispatch-plan).
 *
 * ns owns: Saved Plan resolution, branch-context creation, slot checkout,
 *          Pi launch command building.
 * Herdr owns: workspace/tab creation, explicit pane targeting, process launch.
 */
import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextOutputMessage,
	createPreparedPlanBranchContext,
	createRealBranchContextContext,
	preparePlanBranchContext,
	formatBranchContextEvidence,
	formatBranchContextCreateFailure,
	type BranchContextContext,
	type BranchContextContextFactory,
	type BranchContextCreateOperation,
	type BranchContextEvidence,
	type BranchContextOutputDetails,
	type ReadyPreparedPlanBranchContext,
} from "@nseng-ai/branch-context/api";
import {
	prepareLatestSessionSavedPlan,
	type PlanStoreDirectoryEvidence,
	type ValidatedSessionSavedPlan,
} from "@nseng-ai/plans/api";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import {
	prepareGraphiteTrunk,
	type GraphiteTrunkPreparation,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import type { PiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import { formatCommand } from "@nseng-ai/foundation/command";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext, NotifyLevel } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";
import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/pi";

// Command names are used in the Pi layer (pi/dispatch-plan.ts) via DispatchPlanConfig.
import {
	buildHerdrCreateTabArgs,
	buildHerdrCreateWorkspaceArgs,
	buildHerdrPaneRunArgs,
} from "./cli-gateway.ts";
import { openBranchInHerdrWorkspace, openBranchInHerdrCallerTab } from "./slot.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { getCallerWorkspaceId } from "./sidebar.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

export type DispatchDestination = "workspace" | "tab";

export interface DispatchPlanConfig {
	commandName: string;
	statusKey: string;
	destination: DispatchDestination;
	branchBasis?: "current" | "trunk";
}

export interface HerdrSlotDispatchPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: HerdrPiCommandApi, cwd: string]>;
	slotClient?: SlotClient;
	graphite?: Pick<GraphiteBranchGateway, "trunkBranch">;
	git?: Pick<GitGateway, "branchUpstream">;
	metadataDbAccess?: GraphiteMetadataDbAccess;
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

	const callerWorkspaceId = config.destination === "tab" ? getCallerWorkspaceId() : undefined;
	if (config.destination === "tab" && callerWorkspaceId === undefined) {
		present(
			ctx,
			"tab:dispatch-plan requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
			"error",
		);
		return;
	}

	options.notifyProgress("Finding latest saved plan…");
	await ctx.waitForIdle();
	setStatus(ctx, config, "finding latest saved plan…");

	try {
		const selected = await prepareLatestSessionSavedPlan(pi, {
			cwd: ctx.cwd,
			entries: ctx.sessionManager?.getBranch?.() ?? [],
			...optionalEntry("planStoreRoot", options.options.planStoreRoot),
		});
		if (!selected.ok) {
			present(ctx, selected.error, "error");
			return;
		}

		const checkout = selected.directory;
		const selectedPlan = selected.plan;
		const trunk =
			config.branchBasis === "trunk"
				? await prepareDispatchTrunk({
						pi,
						cwd: checkout.repoRoot,
						preview: parsed.isDryRun,
						options: options.options,
						notify: options.notifyProgress,
					})
				: undefined;
		if (trunk !== undefined && "error" in trunk) {
			present(ctx, trunk.error, "error");
			return;
		}
		setStatus(ctx, config, "deriving branch-context slug…");
		const prepared = await preparePlanBranchContext(pi, {
			plan: selectedPlan,
			checkout,
			context: dispatchBranchContextContext(pi, checkout.repoRoot, options.options),
			shouldBuildPreview: parsed.isDryRun,
			...(trunk === undefined
				? {}
				: {
						explicitBasis: {
							startPoint:
								trunk.startPoint ?? `<result of ${formatCommand("git", trunk.refreshPlan.args)}>`,
							startRef: trunk.startRef,
							graphiteParentBranch: trunk.trunkBranch,
						},
					}),
		});
		const operation = prepared.operation;

		if (prepared.type === "preview") {
			const launchOptions = getPiLaunchOptions(pi, ctx);
			presentBranchContextMessage(
				pi,
				ctx,
				formatDryRun({
					plan: selectedPlan,
					checkout,
					operation,
					branchContextPreview: prepared.preview,
					launchOptions,
					config,
					...optionalEntry("trunk", trunk),
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
			prepared,
			config,
			dispatchOptions: options.options,
			...(callerWorkspaceId === undefined ? {} : { callerWorkspaceId }),
		});
	} catch (error) {
		present(
			ctx,
			`/${config.commandName} failed unexpectedly.\n${formatErrorMessage(error)}`,
			"error",
		);
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

async function prepareDispatchTrunk(options: {
	pi: HerdrPiCommandApi;
	cwd: string;
	preview: boolean;
	options: HerdrSlotDispatchPlanOptions;
	notify: (message: string) => void;
}): Promise<GraphiteTrunkPreparation | { error: string }> {
	return prepareGraphiteTrunk({
		pi: options.pi,
		cwd: options.cwd,
		graphite: options.options.graphite ?? new RealGraphiteBranchGateway(options.pi),
		git: options.options.git ?? new RealGitGateway(options.pi),
		preview: options.preview,
		notify: options.notify,
		...optionalEntry("metadataDbAccess", options.options.metadataDbAccess),
	});
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

async function createAttachAndLaunch(options: {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
	ctx: CommandContext;
	prepared: ReadyPreparedPlanBranchContext;
	config: DispatchPlanConfig;
	dispatchOptions: HerdrSlotDispatchPlanOptions;
	callerWorkspaceId?: string;
}): Promise<void> {
	const { pi, herdr, ctx, prepared, config, dispatchOptions } = options;
	const { checkout, operation } = prepared;

	present(ctx, `Creating Graphite-tracked branch context ${operation.branch}…`, "info");
	setStatus(ctx, config, "creating branch and attaching plan…");

	let evidence: BranchContextEvidence;
	try {
		evidence = await createPreparedPlanBranchContext(pi, prepared);
	} catch (error) {
		present(
			ctx,
			formatBranchContextCreateFailure(operation, error, {
				consequence: formatDispatchFailureConsequence(config.destination),
			}),
			"error",
		);
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

	// The tab precondition captured this before any plan lookup or durable mutation.
	const callerWorkspaceId = options.callerWorkspaceId;
	if (callerWorkspaceId === undefined) {
		throw new Error("Missing validated Herdr caller workspace ID for tab launch.");
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
				"Dispatched plan in Herdr tab.",
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
	trunk?: GraphiteTrunkPreparation;
}): string {
	const { plan, checkout, operation, branchContextPreview, launchOptions, config } = options;
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
		`Repo identity source: ${plan.repoIdentitySource}`,
		`Source branch: ${plan.sourceBranch}`,
		`Branch path segment: ${plan.branchKey}`,
		plan.summary ? `Summary: ${plan.summary}` : undefined,
		...(options.trunk === undefined
			? []
			: [
					"",
					"Graphite trunk preparation (preview only; not executed):",
					`Trunk branch / Graphite parent: ${options.trunk.trunkBranch}`,
					`Configured upstream: ${options.trunk.upstream.remoteName}/${options.trunk.upstream.remoteRef.replace(/^refs\/heads\//, "")}`,
					`Refresh cwd: ${options.trunk.refreshPlan.cwd}`,
					`Refresh command: ${formatCommand("git", options.trunk.refreshPlan.args)}`,
					`Start point after refresh: result of ${formatCommand("git", ["rev-parse", options.trunk.startRef])}`,
				]),
		"",
		branchContextPreview,
		formatCommand("ns", [
			"slot",
			"checkout",
			operation.branch,
			"--format",
			"json",
			"--no-clipboard",
		]),
		formatHerdrLaunchPreview({
			destination: config.destination,
			branch: operation.branch,
			description: `herdr ${config.commandName.split(":").at(-1) ?? "dispatch-plan"} from ${options.trunk?.trunkBranch ?? checkout.sourceBranch}`,
			launchCommand,
		}),
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

/**
 * Preview the exact Herdr CLI sequence the non-dry-run path performs, built
 * from the same argv builders as the CLI adapter. Placeholders stand in for
 * values only known after the slot checkout or Herdr response.
 */
function formatHerdrLaunchPreview(options: {
	destination: DispatchDestination;
	branch: string;
	description: string;
	launchCommand: string;
}): string {
	if (options.destination === "workspace") {
		return [
			formatCommand(
				"herdr",
				buildHerdrCreateWorkspaceArgs({
					cwd: "<slot-worktree-path>",
					label: options.description,
				}),
			),
			formatCommand("herdr", buildHerdrPaneRunArgs("<returned-root-pane>", options.launchCommand)),
		].join("\n");
	}

	return [
		formatCommand(
			"herdr",
			buildHerdrCreateTabArgs({
				workspaceId: "<caller-workspace>",
				cwd: "<slot-worktree-path>",
				label: options.branch,
				shouldFocus: true,
			}),
		),
		formatCommand("herdr", buildHerdrPaneRunArgs("<returned-root-pane>", options.launchCommand)),
	].join("\n");
}

function formatDispatchFailureConsequence(destination: DispatchDestination): string {
	return destination === "workspace"
		? "No Herdr workspace was opened."
		: "No Herdr tab was opened.";
}

function formatUsage(config: DispatchPlanConfig): string {
	return `Usage: /${config.commandName} [--dry-run]

Dispatch the latest saved plan into a new Herdr ${config.destination} for implementation${config.branchBasis === "trunk" ? " from refreshed Graphite trunk" : ""}.

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

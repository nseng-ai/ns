/**
 * Herdr dispatch-plan: attaches the latest session-saved plan to a
 * Graphite-tracked branch via branch-context, then opens the branch either in
 * a new Herdr space (launch:plan:space) or in a focused tab inside
 * the caller's Herdr space (launch:plan:tab).
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
import { prepareLatestSessionSavedPlan, type ValidatedSessionSavedPlan } from "@nseng-ai/plans/api";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import {
	prepareLocalGraphiteTrunk,
	type LocalGraphiteTrunkPreparation,
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
import { dispatchPreparedBranch, type PreparedDispatchDestination } from "./prepared-dispatch.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { getCallerWorkspaceId } from "./sidebar.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import { resolveLaunchBranchBasis } from "./launch-branch-basis.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

export type DispatchDestination = "workspace" | "tab";

export interface DispatchPlanConfig {
	commandName: string;
	statusKey: string;
	destination: DispatchDestination;
}

export interface HerdrSlotDispatchPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: HerdrPiCommandApi, cwd: string]>;
	slotClient?: SlotClient;
	graphite?: Pick<GraphiteBranchGateway, "trunkBranch">;
	git?: Pick<GitGateway, "currentBranch">;
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

	const preparedDestination = prepareDispatchDestination(config.destination);
	if (preparedDestination.type === "failed") {
		present(ctx, preparedDestination.message, "error");
		return;
	}
	const destination = preparedDestination.destination;

	await ctx.waitForIdle();

	try {
		const git = options.options.git ?? new RealGitGateway(pi);
		const selection = await resolveLaunchBranchBasis({
			cwd: ctx.cwd,
			git,
			interaction: ctx,
		});
		if (selection.type === "cancelled") {
			present(ctx, "Herdr launch cancelled.", "info");
			return;
		}
		if (selection.type === "failed") {
			present(ctx, selection.message, "error");
			return;
		}

		options.notifyProgress("Finding latest saved plan…");
		setStatus(ctx, config, "finding latest saved plan…");
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
			selection.basis === "trunk"
				? await prepareDispatchTrunk({
						pi,
						cwd: checkout.repoRoot,
						options: options.options,
						notify: options.notifyProgress,
					})
				: undefined;
		if (trunk !== undefined && "error" in trunk) {
			present(ctx, trunk.error, "error");
			return;
		}
		if (selection.basis === "current") {
			const revalidated = await git.currentBranch({ cwd: checkout.repoRoot });
			if (revalidated.type !== "branch" || revalidated.branch !== selection.currentBranch) {
				present(
					ctx,
					`Current branch changed after selection; expected ${selection.currentBranch}. No branch was created.`,
					"error",
				);
				return;
			}
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
							startPoint: trunk.startPoint,
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
					operation,
					branchContextPreview: prepared.preview,
					launchOptions,
					destination,
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
			destination,
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
	options: HerdrSlotDispatchPlanOptions;
	notify: (message: string) => void;
}): Promise<LocalGraphiteTrunkPreparation | { error: string }> {
	return prepareLocalGraphiteTrunk({
		pi: options.pi,
		cwd: options.cwd,
		graphite: options.options.graphite ?? new RealGraphiteBranchGateway(options.pi),
		notify: options.notify,
		...optionalEntry("metadataDbAccess", options.options.metadataDbAccess),
	});
}

type PrepareDispatchDestinationResult =
	| { readonly type: "ready"; readonly destination: PreparedDispatchDestination }
	| { readonly type: "failed"; readonly message: string };

function prepareDispatchDestination(
	destination: DispatchDestination,
): PrepareDispatchDestinationResult {
	if (destination === "workspace") {
		return { type: "ready", destination: { type: "workspace" } };
	}
	const callerWorkspaceId = getCallerWorkspaceId();
	if (callerWorkspaceId === undefined) {
		return {
			type: "failed",
			message:
				"launch:plan:tab requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
		};
	}
	return { type: "ready", destination: { type: "tab", callerWorkspaceId } };
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
	destination: PreparedDispatchDestination;
}): Promise<void> {
	const { pi, herdr, ctx, prepared, config, dispatchOptions, destination } = options;
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
				consequence: formatDispatchFailureConsequence(destination.type),
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

	const result = await dispatchPreparedBranch(
		{
			herdr,
			slotClient,
			notify: (message, level) => ctx.ui.notify(message, level),
			onStatus: (message) => setStatus(ctx, config, message),
		},
		{
			payload: {
				branchName: operation.branch,
				semanticSlug: operation.slug,
				launchCommand,
			},
			destination,
		},
	);

	if (result.type === "opened") {
		present(
			ctx,
			[
				`Dispatched plan in Herdr ${destination.type}.`,
				`Branch: ${operation.branch}`,
				`Slot: ${result.target.checkout.slotName}`,
				`Worktree: ${result.target.checkout.worktreePath}`,
				...(result.destination === "tab"
					? [`Tab: ${result.target.tabId}`, `Pane: ${result.target.paneId}`]
					: []),
				`Attached plan: ${BRANCH_CONTEXT_NAMESPACE}/${operation.key}`,
				`Command: ${launchCommand}`,
			].join("\n"),
			"info",
		);
	}
}

function formatDryRun(options: {
	plan: ValidatedSessionSavedPlan;
	operation: BranchContextCreateOperation;
	branchContextPreview: string;
	launchOptions: PiLaunchOptions;
	destination: PreparedDispatchDestination;
	trunk?: LocalGraphiteTrunkPreparation;
}): string {
	const { plan, operation, branchContextPreview, launchOptions, destination } = options;
	const launchCommand = buildPiLaunchCommand(
		formatImplBranchContextCommand(operation.key),
		launchOptions,
	);
	return [
		`Dry run: no branch was created, no plan was attached, and no Herdr ${destination.type} was opened.`,
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
					"Local Graphite trunk (read only):",
					`Trunk branch / Graphite parent: ${options.trunk.trunkBranch}`,
					`Local start ref: ${options.trunk.startRef}`,
					`Local start point: ${options.trunk.startPoint}`,
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
			destination: destination.type,
			semanticSlug: operation.slug,
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
	semanticSlug: string;
	launchCommand: string;
}): string {
	if (options.destination === "workspace") {
		return [
			"Workspace label: [sN:]" + options.semanticSlug,
			formatCommand(
				"herdr",
				buildHerdrCreateWorkspaceArgs({
					cwd: "<slot-worktree-path>",
					label: `<optional-compact-slot-prefix>${options.semanticSlug}`,
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
				label: options.semanticSlug,
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

Dispatch the latest saved plan into a new Herdr ${config.destination} for implementation. Choose the current branch or local Graphite trunk contextually at invocation time.

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

/**
 * Herdr impl-plan: attaches the latest session-saved plan to a
 * Graphite-tracked branch via branch-context, then opens the branch either in
 * a new Herdr space (impl:plan:space) or in a focused tab inside
 * the caller's Herdr space (impl:plan:tab).
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
import type { PiLaunchOptions } from "@nseng-ai/capability-kit/pi-launch";
import { formatCommand } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext, NotifyLevel } from "@nseng-ai/capability-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";
import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/pi";

// Command names are used in the Pi layer (pi/impl-plan.ts) via ImplPlanConfig.
import {
	buildHerdrCreateTabArgs,
	buildHerdrCreateWorkspaceArgs,
	buildHerdrPaneRunArgs,
} from "./cli-gateway.ts";
import { launchPreparedBranch, type PreparedLaunchDestination } from "./prepared-launch.ts";
import { createHerdrSlotClient } from "./slot-checkout.ts";
import { getCallerWorkspaceId } from "./sidebar.ts";
import type { HerdrGateway } from "./herdr-gateway.ts";
import { resolveImplBranchBasis } from "./impl-branch-basis.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";

export type ImplDestination = "workspace" | "tab";

export interface ImplPlanConfig {
	commandName: string;
	statusKey: string;
	destination: ImplDestination;
}

export interface HerdrSlotImplPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: HerdrPiCommandApi, cwd: string]>;
	slotClient?: SlotClient;
	git?: Pick<GitGateway, "currentBranch">;
}

export interface ResolvedHerdrSlotImplPlanOptions extends HerdrSlotImplPlanOptions {
	git: Pick<GitGateway, "currentBranch">;
}

interface CommandArgs {
	isDryRun: boolean;
	shouldShowHelp: boolean;
}

export interface HerdrImplPlanContext {
	commands: HerdrPiCommandApi;
	git: Pick<GitGateway, "currentBranch">;
	trunkBranch: string;
	herdr: HerdrGateway;
	pi: CommandContext;
}

export interface HandleHerdrSlotImplPlanOptions {
	rawArgs: string;
	dependencies: ResolvedHerdrSlotImplPlanOptions;
	config: ImplPlanConfig;
	notifyProgress: (message: string) => void;
}

export async function handleHerdrSlotImplPlan(
	context: HerdrImplPlanContext,
	options: HandleHerdrSlotImplPlanOptions,
): Promise<void> {
	const { commands: pi, trunkBranch, herdr, pi: ctx } = context;
	const { rawArgs, config } = options;

	const parsed = parseCommandArgs(rawArgs);
	if ("error" in parsed) {
		present(ctx, `${parsed.error}\n\n${formatUsage(config)}`, "error");
		return;
	}
	if (parsed.shouldShowHelp) {
		present(ctx, formatUsage(config), "info");
		return;
	}

	const preparedDestination = prepareImplDestination(config.destination);
	if (preparedDestination.type === "failed") {
		present(ctx, preparedDestination.message, "error");
		return;
	}
	const destination = preparedDestination.destination;

	await ctx.waitForIdle();

	try {
		const selection = await resolveImplBranchBasis({
			cwd: ctx.cwd,
			git: options.dependencies.git,
			interaction: ctx,
		});
		if (selection.type === "cancelled") {
			present(ctx, "Herdr implementation cancelled.", "info");
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
			...optionalEntry("planStoreRoot", options.dependencies.planStoreRoot),
		});
		if (!selected.ok) {
			present(ctx, selected.error, "error");
			return;
		}

		const checkout = selected.directory;
		const selectedPlan = selected.plan;
		const basis =
			selection.basis === "trunk"
				? await prepareImplTrunkBasis({
						pi,
						trunkBranch,
						cwd: checkout.repoRoot,
						options: options.dependencies,
						notify: options.notifyProgress,
					})
				: ({ type: "current-head" } as const);
		if ("error" in basis) {
			present(ctx, basis.error, "error");
			return;
		}
		if (selection.basis === "current") {
			const revalidated = await options.dependencies.git.currentBranch({ cwd: checkout.repoRoot });
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
			context: implBranchContextContext(pi, checkout.repoRoot, options.dependencies),
			shouldBuildPreview: parsed.isDryRun,
			creation:
				basis.type === "current-head"
					? { type: "graphite-current-parent-current-head" }
					: {
							type: "graphite-explicit",
							startPoint: basis.preparation.startPoint,
							startRef: basis.preparation.startRef,
							parentBranch: basis.preparation.trunkBranch,
						},
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
					config,
					basis,
				}),
				{ status: "dry-run", targetBranch: operation.branch, key: operation.key },
				"info",
			);
			return;
		}

		await createAttachAndImplement({
			pi,
			herdr,
			ctx,
			prepared,
			config,
			planImplOptions: options.dependencies,
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

function implBranchContextContext(
	pi: HerdrPiCommandApi,
	cwd: string,
	options: ResolvedHerdrSlotImplPlanOptions,
): BranchContextContext {
	return options.createBranchContextContext?.(pi, cwd) ?? createRealBranchContextContext({ cwd });
}

type PreparedImplBasis =
	| { type: "current-head" }
	| { type: "resolved-local-trunk"; preparation: LocalGraphiteTrunkPreparation };

async function prepareImplTrunkBasis(options: {
	pi: HerdrPiCommandApi;
	trunkBranch: string;
	cwd: string;
	options: ResolvedHerdrSlotImplPlanOptions;
	notify: (message: string) => void;
}): Promise<PreparedImplBasis | { error: string }> {
	const preparation = await prepareLocalGraphiteTrunk(
		{ pi: options.pi, trunkBranch: options.trunkBranch },
		{
			cwd: options.cwd,
			notify: options.notify,
		},
	);
	return "error" in preparation ? preparation : { type: "resolved-local-trunk", preparation };
}

type PrepareImplDestinationResult =
	| { readonly type: "ready"; readonly destination: PreparedLaunchDestination }
	| { readonly type: "failed"; readonly message: string };

function prepareImplDestination(destination: ImplDestination): PrepareImplDestinationResult {
	if (destination === "workspace") {
		return { type: "ready", destination: { type: "workspace" } };
	}
	const callerWorkspaceId = getCallerWorkspaceId();
	if (callerWorkspaceId === undefined) {
		return {
			type: "failed",
			message:
				"impl:plan:tab requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
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

async function createAttachAndImplement(options: {
	pi: HerdrPiCommandApi;
	herdr: HerdrGateway;
	ctx: CommandContext;
	prepared: ReadyPreparedPlanBranchContext;
	config: ImplPlanConfig;
	planImplOptions: ResolvedHerdrSlotImplPlanOptions;
	destination: PreparedLaunchDestination;
}): Promise<void> {
	const { pi, herdr, ctx, prepared, config, planImplOptions, destination } = options;
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
				consequence: formatImplFailureConsequence(destination.type),
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
		planImplOptions.slotClient ?? createHerdrSlotClient({ cwd: checkout.repoRoot });

	const result = await launchPreparedBranch(
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
				`Opened plan implementation in Herdr ${destination.type}.`,
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
	destination: PreparedLaunchDestination;
	config: ImplPlanConfig;
	basis: PreparedImplBasis;
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
		...(options.basis.type === "current-head"
			? []
			: [
					"",
					"Local Graphite trunk (read only):",
					`Trunk branch / Graphite parent: ${options.basis.preparation.trunkBranch}`,
					`Local start ref: ${options.basis.preparation.startRef}`,
					`Local start point: ${options.basis.preparation.startPoint}`,
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
		formatHerdrImplPreview({
			destination: destination.type,
			semanticSlug: operation.slug,
			description: `herdr ${options.config.commandName.split(":").at(-1) ?? "impl-plan"} from ${options.basis.type === "resolved-local-trunk" ? options.basis.preparation.trunkBranch : plan.sourceBranch}`,
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
function formatHerdrImplPreview(options: {
	destination: ImplDestination;
	semanticSlug: string;
	description: string;
	launchCommand: string;
}): string {
	if (options.destination === "workspace") {
		return [
			`Herdr workspace: ${options.description}`,
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
		`Herdr tab: ${options.description}`,
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

function formatImplFailureConsequence(destination: ImplDestination): string {
	return destination === "workspace"
		? "No Herdr workspace was opened."
		: "No Herdr tab was opened.";
}

function formatUsage(config: ImplPlanConfig): string {
	return `Usage: /${config.commandName} [--dry-run]

Implement the latest saved plan in a new Herdr ${config.destination} for implementation. Choose the current branch or local Graphite trunk contextually at invocation time.

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

function setStatus(ctx: CommandContext, config: ImplPlanConfig, value: string | undefined): void {
	ctx.ui.setStatus?.(config.statusKey, value);
}

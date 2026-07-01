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
} from "@sdl/branch-context/api";
import {
	findLatestSessionSavedPlanFile,
	resolvePlanStoreDirectory,
	type PlanStoreDirectoryEvidence,
	type ValidatedSessionSavedPlan,
} from "@sdl/plans/api";
import { formatCommand, formatShellArg } from "@sdl/core/command";
import { checkoutBranchCmuxSlot, openBranchInCmuxSlot } from "./slot.ts";
import { createCccSlotClient } from "../slot-checkout.ts";
import {
	launchFocusedCmuxTab,
	type FocusedCmuxTabLaunchResult,
} from "@sdl/cmux/focused-terminal-tab";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@sdl/cmux/pi-launch";
import type { PiLaunchOptions } from "@sdl/cmux/pi-launch";
import type { SlotCheckoutTarget, SlotClient } from "@sdl/slot/api";
import { formatErrorMessage, optionalEntry } from "@sdl/core/primitives";
import type { CommandContext, ExtensionAPI, NotifyLevel } from "@sdl/cmux/types";

const BRANCH_CREATION = "graphite";

export type DispatchDestination = "workspace" | "surface";

export interface DispatchPlanConfig {
	commandName: string;
	statusKey: string;
	destination: DispatchDestination;
}

interface CommandArgs {
	isDryRun: boolean;
	shouldShowHelp: boolean;
}

interface HandleCommandOptions {
	pi: ExtensionAPI;
	rawArgs: string;
	ctx: CommandContext;
	options: CccSlotDispatchPlanOptions;
	config: DispatchPlanConfig;
	notifyProgress: (message: string) => void;
	formatBranchContextCommand: (key: string) => string;
}

interface AttachSlotAndLaunchOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	config: DispatchPlanConfig;
	options: CccSlotDispatchPlanOptions;
	notifyProgress: (message: string) => void;
	formatBranchContextCommand: (key: string) => string;
}

interface FormatDryRunOptions {
	plan: ValidatedSessionSavedPlan;
	checkout: PlanStoreDirectoryEvidence;
	operation: BranchContextCreateOperation;
	branchContextPreview: string;
	launchOptions: PiLaunchOptions;
	config: DispatchPlanConfig;
	formatBranchContextCommand: (key: string) => string;
}

interface FormatFinalSuccessOptions {
	operation: Pick<BranchContextCreateOperation, "branch" | "key">;
	target: SlotCheckoutTarget;
	launchOptions: PiLaunchOptions;
	formatBranchContextCommand: (key: string) => string;
}

interface FormatSurfaceSuccessOptions {
	operation: Pick<BranchContextCreateOperation, "branch" | "key">;
	target: SlotCheckoutTarget;
	launch: Extract<FocusedCmuxTabLaunchResult, { type: "launched" }>;
}

export interface CccSlotDispatchPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: ExtensionAPI, cwd: string]>;
	slotClient?: SlotClient;
}

export async function handleCccSlotDispatchPlan({
	pi,
	rawArgs,
	ctx,
	options,
	config,
	notifyProgress,
	formatBranchContextCommand,
}: HandleCommandOptions): Promise<void> {
	const parsed = parseCommandArgs(rawArgs);
	if ("error" in parsed) {
		present(ctx, `${parsed.error}\n\n${formatUsage(config)}`, "error");
		return;
	}

	if (parsed.shouldShowHelp) {
		present(ctx, formatUsage(config), "info");
		return;
	}

	notifyProgress("Finding latest saved plan…");
	await ctx.waitForIdle();

	setStatus(ctx, config, "finding latest saved plan…");
	try {
		const checkout = await resolveCurrentCheckout(pi, ctx.cwd, options);
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
				context: dispatchBranchContextContext(pi, checkout.repoRoot, options),
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
					formatBranchContextCommand,
				}),
				{ status: "dry-run", targetBranch: operation.branch, key: operation.key },
				"info",
			);
			return;
		}

		await createAttachSlotAndLaunch({
			pi,
			ctx,
			checkout,
			operation,
			config,
			options,
			notifyProgress,
			formatBranchContextCommand,
		});
	} catch (error) {
		present(ctx, formatUnexpectedError(error), "error");
	} finally {
		setStatus(ctx, config, undefined);
	}
}

function dispatchBranchContextContext(
	pi: ExtensionAPI,
	cwd: string,
	options: CccSlotDispatchPlanOptions,
): BranchContextContext {
	return options.createBranchContextContext?.(pi, cwd) ?? createRealBranchContextContext({ cwd });
}

function parseCommandArgs(rawArgs: string): CommandArgs | { error: string } {
	const tokens = rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
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
		if (token.startsWith("-")) {
			return { error: `Unknown flag: ${token}` };
		}
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
					"No saved plan from /sdl:plan:save was found in the current session branch.",
					"Run /sdl:plan:save first, then rerun the dispatch command.",
				].join("\n"),
			};
	}
}

async function resolveCurrentCheckout(
	pi: ExtensionAPI,
	cwd: string,
	options: CccSlotDispatchPlanOptions,
): Promise<PlanStoreDirectoryEvidence | { error: string }> {
	let directory: PlanStoreDirectoryEvidence;
	try {
		directory = await resolvePlanStoreDirectory(pi, {
			cwd,
			...optionalEntry("planStoreRoot", options.planStoreRoot),
		});
	} catch (error) {
		return {
			error: `Could not resolve current repository and source branch.\n${formatErrorMessage(error)}`,
		};
	}

	return directory;
}

async function createAttachSlotAndLaunch(options: AttachSlotAndLaunchOptions): Promise<void> {
	const { pi, ctx, checkout, operation, config } = options;
	present(ctx, `Creating Graphite-tracked branch context ${operation.branch}…`, "info");
	setStatus(ctx, config, "creating branch and attaching plan…");
	let evidence: BranchContextEvidence;
	try {
		evidence = await createBranchContextFromFile(pi, operation.params, {
			cwd: checkout.repoRoot,
			context: dispatchBranchContextContext(pi, checkout.repoRoot, options.options),
		});
	} catch (error) {
		present(ctx, formatCccBranchContextCreateFailure(operation, error), "error");
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
	if (config.destination === "workspace") {
		await openBranchInCmuxSlot({
			pi,
			cwd: checkout.repoRoot,
			branchName: operation.branch,
			command: formatPiLaunchCommand(operation, launchOptions, options.formatBranchContextCommand),
			description: `dispatch-plan from ${checkout.sourceBranch}`,
			slotClient: options.options.slotClient ?? createCccSlotClient({ cwd: checkout.repoRoot }),
			notify: (message, level) => ctx.ui.notify(message, level),
			onStatus: (message) => setStatus(ctx, config, message),
			successMessage: (target) =>
				formatFinalSuccess({
					operation,
					target,
					launchOptions,
					formatBranchContextCommand: options.formatBranchContextCommand,
				}),
		});
		return;
	}

	await openBranchInCmuxSurface({
		pi,
		ctx,
		cwd: checkout.repoRoot,
		branchName: operation.branch,
		command: formatPiLaunchCommand(operation, launchOptions, options.formatBranchContextCommand),
		tabTitle: operation.branch,
		operation,
		config,
		...optionalEntry("slotClient", options.options.slotClient),
	});
}

type PresentLevel = Exclude<NotifyLevel, "success">;

function presentBranchContextMessage(
	pi: ExtensionAPI,
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

function formatDryRun(options: FormatDryRunOptions): string {
	const { plan, checkout, operation, branchContextPreview, launchOptions, config } = options;
	const launchCommand = formatPiLaunchCommand(
		operation,
		launchOptions,
		options.formatBranchContextCommand,
	);
	const description = `dispatch-plan from ${checkout.sourceBranch}`;
	return [
		`Dry run: no branch was created, no plan was attached, and no cmux ${config.destination} was opened.`,
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
		"",
		branchContextPreview,
		formatCommand("sdl", [
			"slot",
			"checkout",
			operation.branch,
			"--format",
			"json",
			"--no-clipboard",
		]),
		formatLaunchPreview({
			destination: config.destination,
			branch: operation.branch,
			description,
			launchCommand,
		}),
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function formatCccBranchContextCreateFailure(
	operation: BranchContextCreateOperation,
	error: unknown,
): string {
	const failure = formatBranchContextCreateFailure(operation, error);
	return failure.replace("\n\n", "\nNo cmux workspace was opened.\n\n");
}

function formatFinalSuccess(options: FormatFinalSuccessOptions): string {
	const { operation, target, launchOptions } = options;
	return [
		"Dispatched plan in cmux workspace.",
		`Branch: ${operation.branch}`,
		`Slot: ${target.slotName}`,
		`Worktree: ${target.worktreePath}`,
		`Attached plan: ${BRANCH_CONTEXT_NAMESPACE}/${operation.key}`,
		`Command: ${formatPiLaunchCommand(operation, launchOptions, options.formatBranchContextCommand)}`,
	].join("\n");
}

function formatPiLaunchCommand(
	operation: Pick<BranchContextCreateOperation, "key">,
	launchOptions: PiLaunchOptions,
	formatBranchContextCommand: (key: string) => string,
): string {
	return buildPiLaunchCommand(formatBranchContextCommand(operation.key), launchOptions);
}

function formatSurfaceSuccess(options: FormatSurfaceSuccessOptions): string {
	const { operation, target, launch } = options;
	return [
		"Dispatched plan in cmux surface.",
		`Branch: ${operation.branch}`,
		`Slot: ${target.slotName}`,
		`Worktree: ${target.worktreePath}`,
		`Surface: ${launch.surfaceId}`,
		`Workspace: ${launch.workspaceId}`,
		`Attached plan: ${BRANCH_CONTEXT_NAMESPACE}/${operation.key}`,
		`Command: ${launch.command}`,
	].join("\n");
}

function formatLaunchPreview(options: {
	destination: DispatchDestination;
	branch: string;
	description: string;
	launchCommand: string;
}): string {
	if (options.destination === "workspace") {
		return [
			"cmux new-workspace",
			`--name ${formatShellArg(options.branch)}`,
			`--description ${formatShellArg(options.description)}`,
			"--cwd <slot-worktree-path>",
			`--command ${formatShellArg(options.launchCommand)}`,
		].join(" ");
	}

	const surfaceLaunchCommand = formatSurfaceLaunchCommand(
		"<slot-worktree-path>",
		options.launchCommand,
	);
	return [
		"cmux new-surface --type terminal --workspace <caller-workspace> --pane <caller-pane> --focus true",
		`cmux rename-tab --title ${formatShellArg(options.branch)}`,
		`cmux send -- ${formatShellArg(`${surfaceLaunchCommand}\n`)}`,
	].join("\n");
}

function formatSurfaceLaunchCommand(cwd: string, launchCommand: string): string {
	return `cd ${formatShellArg(cwd)} && ${launchCommand}`;
}

function formatUsage(config: DispatchPlanConfig): string {
	return `Usage: /${config.commandName} [--dry-run]

Dispatch the latest saved plan into a new cmux ${config.destination} for implementation.

Options:
  --dry-run    Show the selected plan and commands without mutating.
  --help, -h   Show this help.

Run /sdl:plan:save first, then rerun /${config.commandName}.`;
}

async function openBranchInCmuxSurface(options: {
	pi: ExtensionAPI;
	ctx: CommandContext;
	cwd: string;
	branchName: string;
	command: string;
	tabTitle: string;
	operation: BranchContextCreateOperation;
	config: DispatchPlanConfig;
	slotClient?: SlotClient;
}): Promise<void> {
	const { pi, ctx, cwd, branchName, command, tabTitle, operation, config } = options;
	const target = await checkoutBranchCmuxSlot({
		pi,
		cwd,
		branchName,
		slotClient: options.slotClient ?? createCccSlotClient({ cwd }),
		notify: (message, level) => ctx.ui.notify(message, level),
		onStatus: (message) => setStatus(ctx, config, message),
	});
	if ("error" in target) return;

	setStatus(ctx, config, "opening cmux surface…");
	const surfaceLaunchCommand = formatSurfaceLaunchCommand(target.worktreePath, command);
	const launched = await launchFocusedCmuxTab({
		host: pi,
		cwd: target.worktreePath,
		tabTitle,
		command: surfaceLaunchCommand,
		signal: undefined,
		onStage: (stage) => setStatus(ctx, config, formatSurfaceStageStatus(stage)),
	});
	if (launched.type === "failed") {
		present(ctx, formatCmuxSurfaceFailure(branchName, target, launched), "error");
		return;
	}

	present(ctx, formatSurfaceSuccess({ operation, target, launch: launched }), "info");
}

function formatSurfaceStageStatus(
	stage: "identify" | "create-surface" | "rename" | "send",
): string {
	switch (stage) {
		case "identify":
			return "identifying cmux caller…";
		case "create-surface":
			return "creating cmux surface…";
		case "rename":
			return "renaming cmux tab…";
		case "send":
			return "sending launch command…";
	}
}

function formatCmuxSurfaceFailure(
	branchName: string,
	target: SlotCheckoutTarget,
	launch: Extract<FocusedCmuxTabLaunchResult, { type: "failed" }>,
): string {
	return [
		"Checked out the branch slot, but failed to open the cmux surface.",
		`Branch: ${branchName}`,
		`Worktree: ${target.worktreePath}`,
		launch.message,
	].join("\n");
}

function formatUnexpectedError(error: unknown): string {
	return ["/dispatch-plan failed unexpectedly.", formatErrorMessage(error)].join("\n");
}

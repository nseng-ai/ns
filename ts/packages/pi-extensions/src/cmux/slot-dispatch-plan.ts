import { basename } from "node:path";

import {
	PLAN_BRANCH_NAMESPACE,
	buildPlannedBranchCreateOperation,
	createPlannedBranchFromFile,
	findLatestSessionSavedPlanFile,
	formatPlannedBranchCreateFailure,
	formatPlannedBranchCreatePreview,
	resolvePlanStoreDirectory,
	resolvePlannedBranchCreatePreviewContext,
	type PlanStoreDirectoryEvidence,
	type PlannedBranchCreateOperation,
	type ValidatedSessionSavedPlan,
} from "@asdl/planned-branch";
import { formatCommand, formatShellArg, shellQuote } from "../command-runtime.ts";
import {
	PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
	formatPlanBranchEvidence,
	type PlannedBranchEvidence,
} from "../planned-branch-output.ts";
import { checkoutSlot, openCmuxWorkspace } from "./slot.ts";
import { buildPiLaunchCommand, getPiLaunchOptions } from "./pi-launch.ts";
import type { PiLaunchOptions } from "./pi-launch.ts";
import type { SlotCheckoutTarget } from "./slot.ts";
import { getWorktreeDescription, repositoryNameFromPath } from "./worktree-description.ts";
import { formatErrorMessage } from "./primitives.ts";
import type { CommandContext, ExtensionAPI, NotifyLevel } from "./types.ts";

const COMMAND_NAME = "cmux-slot:dispatch-plan";
const STATUS_KEY = "cmux-slot:dispatch-plan";
const BRANCH_CREATION = "graphite";

const USAGE = `Usage: /${COMMAND_NAME} [--dry-run]

Dispatch the latest saved plan into a CMUX slot for implementation.

Options:
  --dry-run    Show the selected plan and commands without mutating.
  --help, -h   Show this help.

Run /planned-branch:write-plan first, then rerun /${COMMAND_NAME}.`;

interface CommandArgs {
	isDryRun: boolean;
	shouldShowHelp: boolean;
}

interface CurrentCheckout {
	directory: PlanStoreDirectoryEvidence;
}

interface AttachSlotAndLaunchOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	checkout: CurrentCheckout;
	operation: PlannedBranchCreateOperation;
}

interface FormatDryRunOptions {
	plan: ValidatedSessionSavedPlan;
	checkout: CurrentCheckout;
	operation: PlannedBranchCreateOperation;
	plannedBranchPreview: string;
	launchOptions: PiLaunchOptions;
}

interface FormatCmuxFailureOptions {
	targetBranch: string;
	key: string;
	worktreePath: string;
	cause: string;
	launchOptions: PiLaunchOptions;
}

interface FormatFinalSuccessOptions {
	targetBranch: string;
	key: string;
	target: SlotCheckoutTarget;
	launchOptions: PiLaunchOptions;
}

export interface CmuxSlotDispatchPlanOptions {
	planStoreRoot?: string;
}

export function registerCmuxSlotDispatchPlanCommand(pi: ExtensionAPI, options: CmuxSlotDispatchPlanOptions = {}): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Dispatch the latest saved plan into a CMUX slot for implementation.",
		argumentHint: "[--dry-run]",
		handler: async (args, ctx) => {
			await handleCommand(pi, args, ctx, options);
		},
	});
}

async function handleCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: CmuxSlotDispatchPlanOptions,
): Promise<void> {
	await ctx.waitForIdle();

	const parsed = parseCommandArgs(rawArgs);
	if ("error" in parsed) {
		present(ctx, `${parsed.error}\n\n${USAGE}`, "error");
		return;
	}

	if (parsed.shouldShowHelp) {
		present(ctx, USAGE, "info");
		return;
	}

	setStatus(ctx, "finding latest saved plan…");
	try {
		const checkout = await resolveCurrentCheckout(pi, ctx.cwd, options);
		if ("error" in checkout) {
			present(ctx, checkout.error, "error");
			return;
		}

		const selected = await resolveLatestSavedPlanFromSession(ctx, checkout.directory);
		if ("error" in selected) {
			present(ctx, selected.error, "error");
			return;
		}

		const selectedPlan = selected.plan;
		const operation = buildPlannedBranchCreateOperation({
			slug: selectedPlan.slug,
			filePath: selectedPlan.filePath,
			branchCreation: BRANCH_CREATION,
			summary: selectedPlan.summary,
		});
		if (parsed.isDryRun) {
			const launchOptions = getPiLaunchOptions(pi, ctx);
			const previewContext = await resolvePlannedBranchCreatePreviewContext(pi, { cwd: checkout.directory.repoRoot });
			const plannedBranchPreview = formatPlannedBranchCreatePreview(operation, {
				...previewContext,
				graphiteParentBranch: checkout.directory.sourceBranch,
			});
			presentPlannedBranchMessage(
				pi,
				ctx,
				formatDryRun({ plan: selectedPlan, checkout, operation, plannedBranchPreview, launchOptions }),
				{ status: "dry-run", selectedPlan, targetBranch: operation.branch, key: operation.key, operation },
				"info",
			);
			return;
		}

		await createAttachSlotAndLaunch({
			pi,
			ctx,
			checkout,
			operation,
		});
	} catch (error) {
		present(ctx, formatUnexpectedError(error), "error");
	} finally {
		setStatus(ctx, undefined);
	}
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
	const result = await findLatestSessionSavedPlanFile(ctx.sessionManager?.getBranch?.() ?? [], directory);
	switch (result.type) {
		case "found":
			return { plan: result.plan };
		case "unsafe":
			return { error: result.message };
		case "not-found":
			return {
				error: [
					"No saved plan from /planned-branch:write-plan was found in the current session branch.",
					`Run /planned-branch:write-plan first, then rerun /${COMMAND_NAME}.`,
				].join("\n"),
			};
	}
}

async function resolveCurrentCheckout(
	pi: ExtensionAPI,
	cwd: string,
	options: CmuxSlotDispatchPlanOptions,
): Promise<CurrentCheckout | { error: string }> {
	let directory: PlanStoreDirectoryEvidence;
	try {
		directory = await resolvePlanStoreDirectory(pi, { cwd, planStoreRoot: options.planStoreRoot });
	} catch (error) {
		return { error: `Could not resolve current repository and source branch.\n${formatErrorMessage(error)}` };
	}

	return { directory };
}

async function createAttachSlotAndLaunch(options: AttachSlotAndLaunchOptions): Promise<void> {
	const { pi, ctx, checkout, operation } = options;
	present(ctx, `Creating Graphite-tracked planned branch ${operation.branch}…`, "info");
	setStatus(ctx, "creating branch and attaching plan…");
	let evidence: PlannedBranchEvidence;
	try {
		evidence = await createPlannedBranchFromFile(pi, operation.params, { cwd: checkout.directory.repoRoot });
	} catch (error) {
		present(ctx, formatCmuxPlannedBranchCreateFailure(operation, error), "error");
		return;
	}

	presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", evidence }, "info");

	setStatus(ctx, "checking out CMUX slot…");
	const target = await checkoutSlot(pi, checkout.directory.repoRoot, operation.branch);
	if ("error" in target) {
		present(ctx, formatSlotFailure(operation.branch, operation.key, target.error), "error");
		return;
	}

	setStatus(ctx, "opening CMUX slot workspace…");
	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launchCommand = formatPiLaunchCommand(operation.key, launchOptions);
	const description = await getWorktreeDescription(pi, target.worktreePath, target.branchName);
	const launched = await openCmuxWorkspace(pi, target, {
		description,
		command: launchCommand,
	});
	if ("error" in launched) {
		present(
			ctx,
			formatCmuxFailure({
				targetBranch: operation.branch,
				key: operation.key,
				worktreePath: target.worktreePath,
				cause: launched.error,
				launchOptions,
			}),
			"error",
		);
		return;
	}

	present(ctx, formatFinalSuccess({ targetBranch: operation.branch, key: operation.key, target, launchOptions }), "success");
}

function presentPlannedBranchMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	content: string,
	details: unknown,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	present(ctx, content, level);
}

function present(ctx: CommandContext, message: string, level: NotifyLevel): void {
	ctx.ui.notify(message, level === "success" ? "info" : level);
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	ctx.ui.setStatus?.(STATUS_KEY, value);
}

function formatDryRun(options: FormatDryRunOptions): string {
	const { plan, checkout, operation, plannedBranchPreview, launchOptions } = options;
	const launchCommand = formatPiLaunchCommand(operation.key, launchOptions);
	const description = `${repositoryNameFromPath(checkout.directory.repoRoot) ?? basename(checkout.directory.repoRoot)}/${operation.branch}`;
	return [
		"Dry run: no branch was created, no plan was attached, and no CMUX slot was opened.",
		"",
		"Selected saved plan:",
		`Path: ${plan.filePath}`,
		`Slug: ${plan.slug}`,
		`Repo key: ${plan.repoKey}`,
		`Repo root: ${plan.repoRoot}`,
		`Repo identity source: ${plan.repoIdentitySource}`,
		`Source branch: ${plan.sourceBranch}`,
		`Branch path segment: ${plan.branchKey}`,
		plan.summary ? `Summary: ${plan.summary}` : undefined,
		"",
		plannedBranchPreview,
		formatCommand("slot", ["checkout", operation.branch, "--format", "json", "--no-clipboard"]),
		[
			"cmux new-workspace",
			`--name ${formatShellArg(operation.branch)}`,
			`--description ${formatShellArg(description)}`,
			"--cwd <slot-worktree-path>",
			`--command ${formatShellArg(launchCommand)}`,
		].join(" "),
	].filter((line): line is string => line !== undefined).join("\n");
}

function formatCmuxPlannedBranchCreateFailure(operation: PlannedBranchCreateOperation, error: unknown): string {
	const failure = formatPlannedBranchCreateFailure(operation, error);
	return failure.replace("\n\n", "\nNo CMUX slot was opened.\n\n");
}

function formatSlotFailure(targetBranch: string, key: string, cause: string): string {
	return [
		"Created planned branch and attached plan, but CMUX slot checkout failed.",
		`Branch: ${targetBranch}`,
		`Key: ${key}`,
		`Recovery: free or resize slots, then run /cmux-slot:open-branch ${targetBranch}.`,
		`Alternative: slot checkout ${formatShellArg(targetBranch)}`,
		"",
		cause,
	].join("\n");
}

function formatCmuxFailure(options: FormatCmuxFailureOptions): string {
	const { targetBranch, key, worktreePath, cause, launchOptions } = options;
	return [
		"Created planned branch, attached plan, and checked out the slot, but failed to open the CMUX workspace.",
		`Branch: ${targetBranch}`,
		`Key: ${key}`,
		`Worktree: ${worktreePath}`,
		`Recovery: cd ${shellQuote(worktreePath)} && ${formatPiLaunchCommand(key, launchOptions)}`,
		"",
		cause,
	].join("\n");
}

function formatFinalSuccess(options: FormatFinalSuccessOptions): string {
	const { targetBranch, key, target, launchOptions } = options;
	return [
		"Dispatched plan in CMUX slot.",
		`Branch: ${targetBranch}`,
		`Slot: ${target.slotName}`,
		`Worktree: ${target.worktreePath}`,
		`Attached plan: ${PLAN_BRANCH_NAMESPACE}/${key}`,
		`Command: ${formatPiLaunchCommand(key, launchOptions)}`,
	].join("\n");
}

function formatPiLaunchCommand(key: string, launchOptions: PiLaunchOptions): string {
	return buildPiLaunchCommand(`/planned-branch:impl ${key}`, launchOptions);
}

function formatUnexpectedError(error: unknown): string {
	return [`/${COMMAND_NAME} failed unexpectedly.`, formatErrorMessage(error)].join("\n");
}

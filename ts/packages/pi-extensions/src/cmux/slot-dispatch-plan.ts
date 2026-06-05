import { basename } from "node:path";

import {
	PLAN_BRANCH_NAMESPACE,
	createPlannedBranchFromFile,
	findLatestSessionSavedPlanFile,
	resolvePlanStoreDirectory,
	type PlanStoreDirectoryEvidence,
	type PlannedBranchEvidence,
	type ValidatedSessionSavedPlan,
} from "@asdl/planned-branch";
import { checkoutSlot, openCmuxWorkspace } from "./slot.ts";
import { buildPiLaunchCommand, getPiLaunchOptions } from "./pi-launch.ts";
import type { PiLaunchOptions } from "./pi-launch.ts";
import type { SlotCheckoutTarget } from "./slot.ts";
import { getWorktreeDescription, repositoryNameFromPath } from "./worktree-description.ts";
import type { CommandContext, ExecResult, ExtensionAPI, NotifyLevel } from "./types.ts";

const COMMAND_NAME = "cmux-slot:dispatch-plan";
const STATUS_KEY = "cmux-slot:dispatch-plan";
const PLANNED_BRANCH_MESSAGE_TYPE = "planned-branch-output";
const BRANCH_CREATION = "graphite";

const GIT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

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
	startPoint: string;
}

interface AttachSlotAndLaunchOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	plan: ValidatedSessionSavedPlan;
	checkout: CurrentCheckout;
	targetBranch: string;
	key: string;
}

interface FormatDryRunOptions {
	plan: ValidatedSessionSavedPlan;
	checkout: CurrentCheckout;
	targetBranch: string;
	key: string;
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

type TextResult =
	| {
			ok: true;
			text: string;
	  }
	| {
			ok: false;
			message: string;
	  };

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
		const targetBranch = selectedPlan.slug;
		const key = `${selectedPlan.slug}.md`;
		if (parsed.isDryRun) {
			const launchOptions = getPiLaunchOptions(pi, ctx);
			presentPlannedBranchMessage(
				pi,
				ctx,
				formatDryRun({ plan: selectedPlan, checkout, targetBranch, key, launchOptions }),
				{ status: "dry-run", selectedPlan, targetBranch, key },
				"info",
			);
			return;
		}

		await createAttachSlotAndLaunch({
			pi,
			ctx,
			plan: selectedPlan,
			checkout,
			targetBranch,
			key,
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

	const head = await runText(pi, directory.repoRoot, "git", ["rev-parse", "HEAD"], GIT_TIMEOUT_MS);
	if (!head.ok) {
		return { error: `Could not resolve HEAD.\n${head.message}` };
	}
	if (head.text.length === 0) {
		return { error: "Could not resolve HEAD: git rev-parse returned no commit." };
	}

	return { directory, startPoint: head.text };
}

async function createAttachSlotAndLaunch(options: AttachSlotAndLaunchOptions): Promise<void> {
	const { pi, ctx, plan, checkout, targetBranch, key } = options;
	present(ctx, `Creating Graphite-tracked planned branch ${targetBranch}…`, "info");
	setStatus(ctx, "creating branch and attaching plan…");
	let evidence: PlannedBranchEvidence;
	try {
		evidence = await createPlannedBranchFromFile(
			pi,
			{ slug: plan.slug, filePath: plan.filePath, branchCreation: BRANCH_CREATION, summary: plan.summary },
			{ cwd: checkout.directory.repoRoot },
		);
	} catch (error) {
		present(ctx, formatCreatePlannedBranchFailure(targetBranch, key, plan.filePath, error), "error");
		return;
	}

	presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", evidence }, "info");

	setStatus(ctx, "checking out CMUX slot…");
	const target = await checkoutSlot(pi, checkout.directory.repoRoot, targetBranch);
	if ("error" in target) {
		present(ctx, formatSlotFailure(targetBranch, key, target.error), "error");
		return;
	}

	setStatus(ctx, "opening CMUX slot workspace…");
	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launchCommand = formatPiLaunchCommand(key, launchOptions);
	const description = await getWorktreeDescription(pi, target.worktreePath, target.branchName);
	const launched = await openCmuxWorkspace(pi, target, {
		description,
		command: launchCommand,
	});
	if ("error" in launched) {
		present(
			ctx,
			formatCmuxFailure({
				targetBranch,
				key,
				worktreePath: target.worktreePath,
				cause: launched.error,
				launchOptions,
			}),
			"error",
		);
		return;
	}

	present(ctx, formatFinalSuccess({ targetBranch, key, target, launchOptions }), "success");
}

async function runText(
	pi: ExtensionAPI,
	cwd: string,
	command: string,
	args: string[],
	timeout: number,
): Promise<TextResult> {
	const result = await runCommand(pi, cwd, command, args, timeout);
	if (result.code === 0 && !result.killed) {
		return { ok: true, text: result.stdout.trim() };
	}
	return { ok: false, message: formatCommandFailure(`${command} command failed.`, command, args, result) };
}

async function runCommand(
	pi: ExtensionAPI,
	cwd: string,
	command: string,
	args: string[],
	timeout: number,
): Promise<ExecResult> {
	try {
		return await pi.exec(command, args, { cwd, timeout });
	} catch (error) {
		return {
			code: 127,
			stdout: "",
			stderr: formatErrorMessage(error),
			killed: false,
		};
	}
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
			customType: PLANNED_BRANCH_MESSAGE_TYPE,
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
	const { plan, checkout, targetBranch, key, launchOptions } = options;
	const launchCommand = formatPiLaunchCommand(key, launchOptions);
	const description = `${repositoryNameFromPath(checkout.directory.repoRoot) ?? basename(checkout.directory.repoRoot)}/${targetBranch}`;
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
		"Target:",
		`Branch: ${targetBranch}`,
		`Branch creation: ${BRANCH_CREATION}`,
		`Start point: ${checkout.startPoint}`,
		`Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}`,
		`Branch Memory key: ${key}`,
		"",
		"Commands that would run:",
		formatCommand("git", ["branch", targetBranch, "HEAD"]),
		formatCommand("gt", ["track", targetBranch, "--parent", checkout.directory.sourceBranch, "--no-interactive"]),
		formatCommand("brmem", ["put", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", targetBranch, "--file", plan.filePath, "--format", "json"]),
		formatCommand("slot", ["checkout", targetBranch, "--format", "json", "--no-clipboard"]),
		[
			"cmux new-workspace",
			`--name ${formatArg(targetBranch)}`,
			`--description ${formatArg(description)}`,
			"--cwd <slot-worktree-path>",
			`--command ${formatArg(launchCommand)}`,
		].join(" "),
	].filter((line): line is string => line !== undefined).join("\n");
}

function formatPlanBranchEvidence(evidence: PlannedBranchEvidence): string {
	const lines = [
		"Created planned branch and attached plan.",
		`Branch: ${evidence.branch}`,
		`Branch creation: ${evidence.branchCreation}`,
		`Start point: ${evidence.startPoint}`,
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
		`Ref: ${evidence.refName}`,
		`Commit: ${evidence.commit}`,
		`Source file: ${evidence.sourceFile}`,
	];
	if (evidence.summary !== undefined) {
		lines.push(`Summary: ${evidence.summary}`);
	}
	return lines.join("\n");
}

function formatCreatePlannedBranchFailure(targetBranch: string, key: string, sourceFile: string, error: unknown): string {
	return [
		"Failed to create planned branch and attach plan.",
		`Branch: ${targetBranch}`,
		`Branch creation: ${BRANCH_CREATION}`,
		`Namespace: ${PLAN_BRANCH_NAMESPACE}`,
		`Key: ${key}`,
		`Source file: ${sourceFile}`,
		"No CMUX slot was opened.",
		"",
		formatErrorMessage(error),
	].join("\n");
}

function formatSlotFailure(targetBranch: string, key: string, cause: string): string {
	return [
		"Created planned branch and attached plan, but CMUX slot checkout failed.",
		`Branch: ${targetBranch}`,
		`Key: ${key}`,
		`Recovery: free or resize slots, then run /cmux-slot:open-branch ${targetBranch}.`,
		`Alternative: slot checkout ${formatArg(targetBranch)}`,
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

function formatCommandFailure(title: string, command: string, args: string[], result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const sections = [
		`${title} (${status})`,
		`Command: ${formatCommand(command, args)}`,
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	];
	return tailText(sections.filter((section) => section.length > 0).join("\n\n"));
}

function formatOutputSection(label: string, value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? `${label}:\n${tailText(trimmed)}` : "";
}

function formatCommand(command: string, args: string[]): string {
	return [command, ...args.map(formatArg)].join(" ");
}

function formatArg(value: string): string {
	return /^[A-Za-z0-9_./:=@%+,-]+$/.test(value) ? value : shellQuote(value);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function tailText(value: string): string {
	if (value.length <= MAX_ERROR_CHARS) {
		return value;
	}
	return `…${value.slice(-MAX_ERROR_CHARS)}`;
}

function formatUnexpectedError(error: unknown): string {
	return [`/${COMMAND_NAME} failed unexpectedly.`, formatErrorMessage(error)].join("\n");
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}


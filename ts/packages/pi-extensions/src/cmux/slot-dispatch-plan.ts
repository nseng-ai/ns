import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import { PLAN_BRANCH_NAMESPACE, createPlannedBranchFromFile, type PlannedBranchEvidence } from "@asdl/planned-branch";
import { checkoutSlot, openCmuxWorkspace } from "./slot.ts";
import { buildPiLaunchCommand, getPiLaunchOptions } from "./pi-launch.ts";
import type { PiLaunchOptions } from "./pi-launch.ts";
import type { SlotCheckoutTarget } from "./slot.ts";
import { getWorktreeDescription, repositoryNameFromPath } from "./worktree-description.ts";
import type { CommandContext, ExecResult, ExtensionAPI, NotifyLevel } from "./types.ts";

const COMMAND_NAME = "cmux-slot:dispatch-plan";
const STATUS_KEY = "cmux-slot:dispatch-plan";
const WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME = "write_source_branch_plan_file";
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

interface SavedPlanEvidence {
	slug: string;
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: "origin-url" | "repo-root";
	sourceBranch: string;
	branchKey: string;
	filePath: string;
	summary?: string;
}

interface CurrentCheckout {
	repoRoot: string;
	branch: string;
	startPoint: string;
}

interface AttachSlotAndLaunchOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	plan: SavedPlanEvidence;
	checkout: CurrentCheckout;
	targetBranch: string;
	key: string;
}

interface FormatDryRunOptions {
	plan: SavedPlanEvidence;
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

export function registerCmuxSlotDispatchPlanCommand(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Dispatch the latest saved plan into a CMUX slot for implementation.",
		argumentHint: "[--dry-run]",
		handler: async (args, ctx) => {
			await handleCommand(pi, args, ctx);
		},
	});
}

async function handleCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
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
		const selected = resolveLatestSavedPlanFromSession(ctx);
		if ("error" in selected) {
			present(ctx, selected.error, "error");
			return;
		}

		const checkout = await resolveCurrentCheckout(pi, ctx.cwd);
		if ("error" in checkout) {
			present(ctx, checkout.error, "error");
			return;
		}

		const selectedPlan = selected.plan;
		const planValidation = await validateSavedPlanForCurrentCheckout(selectedPlan, checkout);
		if ("error" in planValidation) {
			present(ctx, planValidation.error, "error");
			return;
		}

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

function resolveLatestSavedPlanFromSession(ctx: CommandContext): { plan: SavedPlanEvidence } | { error: string } {
	const entries = ctx.sessionManager?.getBranch?.() ?? [];
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const plan = extractSavedPlanFromSessionEntry(entries[index]);
		if (plan !== undefined) {
			return { plan };
		}
	}

	return {
		error: [
			"No saved plan from /planned-branch:write-plan was found in the current session branch.",
			`Run /planned-branch:write-plan first, then rerun /${COMMAND_NAME}.`,
		].join("\n"),
	};
}

function extractSavedPlanFromSessionEntry(entry: unknown): SavedPlanEvidence | undefined {
	if (!isRecord(entry) || entry.type !== "message") {
		return undefined;
	}

	const message = entry.message;
	if (!isRecord(message) || message.role !== "toolResult") {
		return undefined;
	}
	if (message.toolName !== WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME || message.isError === true) {
		return undefined;
	}

	const details = message.details;
	if (!isRecord(details)) {
		return undefined;
	}

	return coerceSavedPlanEvidence(details);
}

function coerceSavedPlanEvidence(details: Record<string, unknown>): SavedPlanEvidence | undefined {
	const slug = stringField(details, "slug");
	const repoRoot = stringField(details, "repoRoot");
	const repoKey = stringField(details, "repoKey");
	const repoIdentitySource = details.repoIdentitySource;
	const sourceBranch = stringField(details, "sourceBranch");
	const branchKey = stringField(details, "branchKey");
	const filePath = stringField(details, "filePath");

	if (
		slug === undefined ||
		repoRoot === undefined ||
		repoKey === undefined ||
		sourceBranch === undefined ||
		branchKey === undefined ||
		filePath === undefined
	) {
		return undefined;
	}
	if (repoIdentitySource !== "origin-url" && repoIdentitySource !== "repo-root") {
		return undefined;
	}
	if (!isValidPlanSlug(slug)) {
		return undefined;
	}
	if (!isAbsolute(filePath) || !filePath.endsWith(".md")) {
		return undefined;
	}
	if (basename(filePath) !== `${slug}.md`) {
		return undefined;
	}

	const summary = details.summary;
	if (summary !== undefined && typeof summary !== "string") {
		return undefined;
	}

	const evidence: SavedPlanEvidence = {
		slug,
		repoRoot,
		repoKey,
		repoIdentitySource,
		sourceBranch,
		branchKey,
		filePath,
	};
	if (summary === undefined) {
		return evidence;
	}
	return { ...evidence, summary };
}

function isValidPlanSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !slug.endsWith(".md") && !slug.includes("/") && !/\s/.test(slug);
}

async function resolveCurrentCheckout(pi: ExtensionAPI, cwd: string): Promise<CurrentCheckout | { error: string }> {
	const repoRoot = await runText(pi, cwd, "git", ["rev-parse", "--show-toplevel"], GIT_TIMEOUT_MS);
	if (!repoRoot.ok) {
		return { error: `Current checkout is not inside a Git repository.\n${repoRoot.message}` };
	}

	const root = repoRoot.text;
	const branch = await runText(pi, root, "git", ["branch", "--show-current"], GIT_TIMEOUT_MS);
	if (!branch.ok) {
		return { error: `Could not resolve current branch.\n${branch.message}` };
	}
	if (branch.text.length === 0) {
		return { error: "Current checkout is detached; a named source branch is required." };
	}

	const head = await runText(pi, root, "git", ["rev-parse", "HEAD"], GIT_TIMEOUT_MS);
	if (!head.ok) {
		return { error: `Could not resolve HEAD.\n${head.message}` };
	}
	if (head.text.length === 0) {
		return { error: "Could not resolve HEAD: git rev-parse returned no commit." };
	}

	return {
		repoRoot: root,
		branch: branch.text,
		startPoint: head.text,
	};
}

async function validateSavedPlanForCurrentCheckout(
	plan: SavedPlanEvidence,
	checkout: CurrentCheckout,
): Promise<{ ok: true } | { error: string }> {
	const planRoot = await normalizePathForComparison(plan.repoRoot);
	const currentRoot = await normalizePathForComparison(checkout.repoRoot);
	if (planRoot !== currentRoot) {
		return {
			error: [
				"Latest saved plan belongs to a different repo or branch.",
				`Plan repo: ${plan.repoRoot}`,
				`Current repo: ${checkout.repoRoot}`,
				`Plan source branch: ${plan.sourceBranch}`,
				`Current branch: ${checkout.branch}`,
			].join("\n"),
		};
	}

	if (plan.sourceBranch !== checkout.branch) {
		return {
			error: [
				"Latest saved plan belongs to a different repo or branch.",
				`Plan repo: ${plan.repoRoot}`,
				`Current repo: ${checkout.repoRoot}`,
				`Plan source branch: ${plan.sourceBranch}`,
				`Current branch: ${checkout.branch}`,
			].join("\n"),
		};
	}

	try {
		const fileStat = await stat(plan.filePath);
		if (!fileStat.isFile()) {
			return { error: `Saved plan path is not a regular file: ${plan.filePath}` };
		}
	} catch (error) {
		return {
			error: [`Saved plan file does not exist or is not accessible: ${plan.filePath}`, formatErrorMessage(error)].join("\n"),
		};
	}

	return { ok: true };
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
			{ cwd: checkout.repoRoot },
		);
	} catch (error) {
		present(ctx, formatCreatePlannedBranchFailure(targetBranch, key, plan.filePath, error), "error");
		return;
	}

	presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", evidence }, "info");

	setStatus(ctx, "checking out CMUX slot…");
	const target = await checkoutSlot(pi, checkout.repoRoot, targetBranch);
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
	const description = `${repositoryNameFromPath(checkout.repoRoot) ?? basename(checkout.repoRoot)}/${targetBranch}`;
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
		formatCommand("gt", ["track", targetBranch, "--parent", checkout.branch, "--no-interactive"]),
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

async function normalizePathForComparison(path: string): Promise<string> {
	const resolved = resolve(path);
	try {
		return await realpath(resolved);
	} catch {
		return resolved;
	}
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatUnexpectedError(error: unknown): string {
	return [`/${COMMAND_NAME} failed unexpectedly.`, formatErrorMessage(error)].join("\n");
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

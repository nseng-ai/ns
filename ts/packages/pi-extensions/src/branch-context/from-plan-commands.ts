import { formatBranchContextUpAndImplFollowUpFlow, runBranchContextUpAndImplLaunch } from "@asdl/ccc/branch-context-up-and-impl";
import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextOutputMessage,
	buildBranchContextPlanKey,
	buildImplBranchContextPrompt,
	createBranchContextContext,
	derivePlanContentSlug,
	deriveTargetBranch,
	formatBranchContextEvidence,
	formatExistingBranchContextReuse,
	formatImplBranchContextCommand,
	formatLoadedAttachedPlanEvidence,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	resolveExistingBranchContextReuse,
	type BranchContextEvidence,
	type BranchContextOutputDetails,
	type BranchCreationMethod,
	type ExistingBranchContextReuse,
	type PlanContentSlugEvidence,
} from "@asdl/branch-context";
import { NoSavedPlanAvailableError, type RepoIdentitySource, type SelectedSavedPlanFile } from "@asdl/plans";
import { formatErrorMessage } from "@asdl/core/primitives";
import {
	resolveBranchContextDefaultCreation,
	resolveBranchContextOperations,
	resolvePlanStoreRootOption,
} from "./options.ts";
import type { BranchContextExtensionOptions, BranchContextOperations, CommandContext, ExtensionAPI, NotifyLevel } from "./host-types.ts";

export const CREATE_BRANCH_CONTEXT_COMMAND_NAME = "branch-context:from-plan";
export const UP_AND_IMPL_COMMAND_NAME = "branch-context:upstack-impl-session";
const BRANCH_CONTEXT_STATUS_KEY = "branch-context:from-plan";
const UP_AND_IMPL_STATUS_KEY = "branch-context:upstack-impl-session";
const IMPL_BRANCH_CONTEXT_STATUS_KEY = IMPL_BRANCH_CONTEXT_COMMAND_NAME;

export const CREATE_BRANCH_CONTEXT_USAGE = `Usage: /branch-context:from-plan [options] [absolute-or-home-plan-file.md]

Create a branch context from a saved plan. The branch slug is derived from the plan content by a tiny Pi model, then the plan is attached to the branch in Branch Memory as <content-derived-slug>.md.

Options:
  --dry-run          Show the selected plan and target branch without mutating.
  --yes, -y          Compatibility no-op; resolved branch contexts create without confirmation.
  --graphite         Create the target branch with Graphite.
  --plain-git        Create the target branch with plain Git.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.
The saved-plan filename is only a locator. If the model cannot derive and validate a content slug, the command fails without falling back to the filename.`;

export const UP_AND_IMPL_USAGE = `Usage: /branch-context:upstack-impl-session [options] [absolute-or-home-plan-file.md]

Stack a branch context on the current branch with Graphite, attach the saved plan, check out that branch with exact git checkout <branch>, start a fresh Pi session, and run /branch-context:impl <attached-key> for the attached plan in that new session.

Options:
  --dry-run          Show the selected plan and follow-up flow without mutating.
  --yes, -y          Compatibility no-op; resolved branch contexts create without confirmation.
  --graphite         Default: stack the target branch on the current branch with Graphite.
  --plain-git        Escape hatch: create with plain Git instead; no Graphite tracking, so the branch will not be part of a stack.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

The current branch must be trunk or a Graphite-tracked branch; otherwise this command fails before creating a branch or attaching a plan.
With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.

This command intentionally models the manual flow: /branch-context:from-plan --graphite, git checkout <branch>, /new, then /branch-context:impl <attached-key> in the new Pi session.`;

export interface CreateBranchContextArgs {
	help: boolean;
	dryRun: boolean;
	yes: boolean;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	filePath?: string;
}

interface CreateBranchContextPreviewBase {
	slug: string;
	savedPlanFileStem: string;
	filePath: string;
	fileName: string;
	planKey: string;
	targetBranch: string;
	branchNameForCreation?: string;
	isExplicitTargetBranch: boolean;
	slugEvidence: PlanContentSlugEvidence;
	branchCreation: BranchCreationMethod;
	summary?: string;
}

interface ExplicitCreateBranchContextPreview extends CreateBranchContextPreviewBase {
	mode: "explicit";
}

interface StoredCreateBranchContextPreview extends CreateBranchContextPreviewBase {
	mode: "latest" | "session";
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	modifiedTimeMs?: number;
}

export type CreateBranchContextPreview = ExplicitCreateBranchContextPreview | StoredCreateBranchContextPreview;

interface BranchContextTargetBranch {
	targetBranch: string;
	branchNameForCreation?: string;
	isExplicitTargetBranch: boolean;
}

class CreateBranchContextUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CreateBranchContextUsageError";
	}
}

export function parseCreateBranchContextArgs(rawArgs: string): CreateBranchContextArgs {
	const parsed: CreateBranchContextArgs = { help: false, dryRun: false, yes: false };
	const tokens = rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const positional: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (token === "--yes" || token === "-y") {
			parsed.yes = true;
			continue;
		}
		if (token === "--graphite") {
			setBranchCreation(parsed, "graphite");
			continue;
		}
		if (token === "--plain-git") {
			setBranchCreation(parsed, "plain-git");
			continue;
		}
		if (token === "--branch") {
			const value = tokens[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new CreateBranchContextUsageError("Missing value for --branch.");
			}
			parsed.branchName = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				throw new CreateBranchContextUsageError("Missing value for --branch.");
			}
			parsed.branchName = value;
			continue;
		}
		if (token.startsWith("-")) {
			throw new CreateBranchContextUsageError(`Unknown flag: ${token}`);
		}

		positional.push(token);
	}

	if (positional.length > 1) {
		throw new CreateBranchContextUsageError("Expected at most one plan file path.");
	}
	const filePath = positional[0];
	if (filePath !== undefined) {
		parsed.filePath = filePath;
	}

	return parsed;
}

function setBranchCreation(args: CreateBranchContextArgs, branchCreation: BranchCreationMethod): void {
	if (args.branchCreation !== undefined && args.branchCreation !== branchCreation) {
		throw new CreateBranchContextUsageError("Cannot pass both --graphite and --plain-git.");
	}
	args.branchCreation = branchCreation;
}

export async function resolveCreateBranchContextPlanFile(
	pi: ExtensionAPI,
	args: CreateBranchContextArgs,
	ctx: CommandContext,
	options: BranchContextExtensionOptions = {},
): Promise<SelectedSavedPlanFile> {
	return resolveSelectedSavedPlanFile(pi, args, ctx, options);
}

export async function deriveCreateBranchContextPreview(
	pi: ExtensionAPI,
	args: CreateBranchContextArgs,
	ctx: CommandContext,
	selected: SelectedSavedPlanFile,
	options: BranchContextExtensionOptions = {},
): Promise<CreateBranchContextPreview> {
	const selectedFile = selectedSavedPlanFileInfo(selected);
	const slugEvidence = await derivePlanContentSlug(pi, { filePath: selectedFile.filePath, cwd: ctx.cwd });
	const branchCreation = args.branchCreation ?? resolveBranchContextDefaultCreation(options);
	const target = deriveBranchContextTargetBranch(args, slugEvidence.slug, options);
	const planKey = buildBranchContextPlanKey(slugEvidence.slug);
	const base = {
		slug: slugEvidence.slug,
		savedPlanFileStem: selected.savedPlanFileStem,
		filePath: selectedFile.filePath,
		fileName: selectedFile.fileName,
		planKey,
		targetBranch: target.targetBranch,
		...(target.branchNameForCreation === undefined ? {} : { branchNameForCreation: target.branchNameForCreation }),
		isExplicitTargetBranch: target.isExplicitTargetBranch,
		branchCreation,
		slugEvidence,
	};

	if (selected.type === "explicit") {
		return { ...base, mode: "explicit" };
	}

	return {
		...base,
		mode: selected.type,
		repoRoot: selected.plan.repoRoot,
		repoKey: selected.plan.repoKey,
		repoIdentitySource: selected.plan.repoIdentitySource,
		sourceBranch: selected.plan.sourceBranch,
		branchKey: selected.plan.branchKey,
		modifiedTimeMs: selected.plan.modifiedTimeMs,
		...(selected.type === "session" && selected.plan.summary !== undefined ? { summary: selected.plan.summary } : {}),
	};
}

export async function resolveCreateBranchContextPreview(
	pi: ExtensionAPI,
	args: CreateBranchContextArgs,
	ctx: CommandContext,
	options: BranchContextExtensionOptions = {},
): Promise<CreateBranchContextPreview> {
	const selected = await resolveCreateBranchContextPlanFile(pi, args, ctx, options);
	return deriveCreateBranchContextPreview(pi, args, ctx, selected, options);
}

export function formatCreateBranchContextPreview(preview: CreateBranchContextPreview): string {
	const lines = [
		preview.mode === "explicit"
			? "Explicit saved plan file:"
			: preview.mode === "session"
				? "Saved plan from current session:"
				: "Latest saved plan from local plan store:",
	];
	lines.push(`Path: ${preview.filePath}`);
	lines.push(`Saved-plan file stem: ${preview.savedPlanFileStem}`);
	lines.push(`Content-derived slug: ${preview.slug}`);
	lines.push(`Slug model: ${preview.slugEvidence.provider}/${preview.slugEvidence.model}`);
	if (preview.mode !== "explicit") {
		lines.push(`Repo key: ${preview.repoKey}`);
		lines.push(`Repo root: ${preview.repoRoot}`);
		lines.push(`Repo identity source: ${preview.repoIdentitySource}`);
		lines.push(`Source branch: ${preview.sourceBranch}`);
		lines.push(`Branch path segment: ${preview.branchKey}`);
		if (preview.modifiedTimeMs !== undefined) {
			lines.push(`Modified: ${new Date(preview.modifiedTimeMs).toISOString()}`);
		}
	}
	lines.push("");
	lines.push("Target:");
	lines.push(`Branch: ${preview.targetBranch}`);
	lines.push(`Branch creation: ${preview.branchCreation}`);
	lines.push("Attach plan as:");
	lines.push(`Branch Memory namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
	lines.push(`Branch Memory key: ${preview.planKey}`);
	return lines.join("\n");
}


export async function handleImplBranchContextCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();
	const trimmedArgs = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Loading attached branch-context plan…", "info");
	}

	ctx.ui.setStatus(IMPL_BRANCH_CONTEXT_STATUS_KEY, "loading attached plan…");
	try {
		const operations = resolveBranchContextOperations(options);
		const params = trimmedArgs.length > 0 ? { requestedKey: trimmedArgs } : {};
		const plan = await operations.loadBranchContextPlan(pi, params, {
			cwd: ctx.cwd,
			context: createBranchContextContext(pi),
			planStoreRoot: resolvePlanStoreRootOption(options),
			sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		});
		presentBranchContextMessage(pi, ctx, formatLoadedAttachedPlanEvidence(plan), { status: "loaded-plan" }, "info");
		pi.sendUserMessage(buildImplBranchContextPrompt(plan));
	} catch (error) {
		presentBranchContextFailure(pi, ctx, "Failed to load branch-context plan.", error);
	} finally {
		ctx.ui.setStatus(IMPL_BRANCH_CONTEXT_STATUS_KEY, undefined);
	}
}

export async function handleCreateBranchContextCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();

	let args: CreateBranchContextArgs;
	try {
		args = parseCreateBranchContextArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreateBranchContextUsageError) {
			presentBranchContextMessage(pi, ctx, `Usage error: ${error.message}\n\n${CREATE_BRANCH_CONTEXT_USAGE}`, { status: "usage" }, "error");
			return;
		}
		throw error;
	}

	if (args.help) {
		presentBranchContextMessage(pi, ctx, CREATE_BRANCH_CONTEXT_USAGE, { status: "usage" }, "info");
		return;
	}

	let selected: SelectedSavedPlanFile;
	ctx.ui.setStatus(BRANCH_CONTEXT_STATUS_KEY, "finding saved plan…");
	try {
		selected = await resolveCreateBranchContextPlanFile(pi, args, ctx, options);
	} catch (error) {
		presentBranchContextFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
		return;
	}

	let preview: CreateBranchContextPreview;
	ctx.ui.setStatus(BRANCH_CONTEXT_STATUS_KEY, "deriving branch slug from plan content…");
	try {
		preview = await deriveCreateBranchContextPreview(pi, args, ctx, selected, options);
	} catch (error) {
		presentBranchContextFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
		return;
	} finally {
		ctx.ui.setStatus(BRANCH_CONTEXT_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		const previewText = formatCreateBranchContextPreview(preview);
		presentBranchContextMessage(
			pi,
			ctx,
			`Dry run: no branch was created and no plan was attached.\n\n${previewText}`,
			{ status: "dry-run", targetBranch: preview.targetBranch, key: preview.planKey },
			"info",
		);
		return;
	}

	ctx.ui.setStatus(BRANCH_CONTEXT_STATUS_KEY, "creating branch and attaching plan…");
	try {
		const evidence = await createBranchContextFromPreview({ pi, preview, ctx, operations: resolveBranchContextOperations(options) });
		presentBranchContextMessage(pi, ctx, formatBranchContextEvidence(evidence), { status: "success", evidence }, "info");
	} catch (error) {
		presentBranchContextFailure(pi, ctx, "Failed to create branch context and attach the plan.", error);
	} finally {
		ctx.ui.setStatus(BRANCH_CONTEXT_STATUS_KEY, undefined);
	}
}

export async function handleUpAndImplCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();

	let args: CreateBranchContextArgs;
	try {
		args = parseCreateBranchContextArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreateBranchContextUsageError) {
			presentBranchContextMessage(pi, ctx, `Usage error: ${error.message}\n\n${UP_AND_IMPL_USAGE}`, { status: "usage" }, "error");
			return;
		}
		throw error;
	}

	if (args.help) {
		presentBranchContextMessage(pi, ctx, UP_AND_IMPL_USAGE, { status: "usage" }, "info");
		return;
	}

	const previewOptions: BranchContextExtensionOptions = { ...options, branchContextDefaultCreation: "graphite" };
	let selected: SelectedSavedPlanFile;
	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "finding saved plan…");
	try {
		selected = await resolveCreateBranchContextPlanFile(pi, args, ctx, previewOptions);
	} catch (error) {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
		if (!(error instanceof NoSavedPlanAvailableError)) {
			presentBranchContextFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
			return;
		}
		await handleUpAndImplExistingReuse({ pi, args, ctx, originalError: error });
		return;
	}

	let preview: CreateBranchContextPreview;
	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "deriving branch slug from plan content…");
	try {
		preview = await deriveCreateBranchContextPreview(pi, args, ctx, selected, previewOptions);
	} catch (error) {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
		presentBranchContextFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
		return;
	} finally {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		presentBranchContextMessage(
			pi,
			ctx,
			formatUpAndImplDryRunMessage(formatCreateBranchContextPreview(preview), preview.targetBranch, preview.planKey),
			{ status: "dry-run", targetBranch: preview.targetBranch, key: preview.planKey },
			"info",
		);
		return;
	}

	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "creating branch and attaching plan…");
	let evidence: BranchContextEvidence;
	try {
		evidence = await createBranchContextFromPreview({ pi, preview, ctx, operations: resolveBranchContextOperations(options) });
	} catch (error) {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
		presentBranchContextFailure(pi, ctx, "Failed to create branch context and attach the plan.", error);
		return;
	}

	await runUpAndImplLaunchTail({
		pi,
		ctx,
		mode: "created",
		target: evidence,
		successBody: formatBranchContextEvidence(evidence),
		outputDetails: { status: "success", evidence },
	});
}

interface CreateBranchContextFromPreviewOptions {
	pi: ExtensionAPI;
	preview: CreateBranchContextPreview;
	ctx: CommandContext;
	operations: BranchContextOperations;
}

interface HandleUpAndImplExistingReuseOptions {
	pi: ExtensionAPI;
	args: CreateBranchContextArgs;
	ctx: CommandContext;
	originalError: unknown;
}

async function handleUpAndImplExistingReuse(options: HandleUpAndImplExistingReuseOptions): Promise<void> {
	const { pi, args, ctx, originalError } = options;
	let reuse: ExistingBranchContextReuse;
	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "finding existing branch context…");
	try {
		const sessionEntries = ctx.sessionManager?.getBranch?.() ?? [];
		reuse = await resolveExistingBranchContextReuse(
			pi,
			args.branchName === undefined ? { sessionEntries } : { explicitBranch: args.branchName, sessionEntries },
			{ cwd: ctx.cwd, context: createBranchContextContext(pi) },
		);
	} catch (reuseError) {
		presentBranchContextMessage(
			pi,
			ctx,
			formatExistingReuseFailureMessage(originalError, reuseError),
			{ status: "failure", error: formatErrorMessage(reuseError) },
			"error",
		);
		return;
	} finally {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		presentBranchContextMessage(
			pi,
			ctx,
			formatUpAndImplDryRunMessage(formatExistingBranchContextReuse(reuse), reuse.branch, reuse.key),
			{ status: "dry-run", targetBranch: reuse.branch, key: reuse.key },
			"info",
		);
		return;
	}

	await runUpAndImplLaunchTail({
		pi,
		ctx,
		mode: "reused",
		target: reuse,
		successBody: `Reusing existing branch context and attached plan.\n\n${formatExistingBranchContextReuse(reuse)}`,
		outputDetails: { status: "reuse" },
	});
}

async function createBranchContextFromPreview({
	pi,
	preview,
	ctx,
	operations,
}: CreateBranchContextFromPreviewOptions): Promise<BranchContextEvidence> {
	const params: { slug: string; filePath: string; branchCreation: BranchCreationMethod; branchName?: string; summary?: string } = {
		slug: preview.slug,
		filePath: preview.filePath,
		branchCreation: preview.branchCreation,
	};
	if (preview.branchNameForCreation !== undefined) {
		params.branchName = preview.branchNameForCreation;
	}
	if (preview.summary !== undefined) {
		params.summary = preview.summary;
	}

	return operations.createBranchContextFromFile(pi, params, { cwd: ctx.cwd, context: createBranchContextContext(pi) });
}

function formatExistingReuseFailureMessage(originalError: unknown, reuseError: unknown): string {
	return [
		"Failed to resolve saved plan file or derive branch slug.",
		"",
		"Original saved-plan resolution failure:",
		formatErrorMessage(originalError),
		"",
		"Existing branch-context reuse failure:",
		formatErrorMessage(reuseError),
	].join("\n");
}

type UpAndImplMode = "created" | "reused";

interface UpAndImplLaunchTailOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	mode: UpAndImplMode;
	target: Pick<BranchContextEvidence, "branch" | "key">;
	successBody: string;
	outputDetails: BranchContextOutputDetails;
}

async function runUpAndImplLaunchTail(options: UpAndImplLaunchTailOptions): Promise<void> {
	const { pi, ctx, mode, target } = options;
	presentBranchContextMessage(pi, ctx, options.successBody, options.outputDetails, "info");

	const launchResult = await runBranchContextUpAndImplLaunch({ host: pi, ctx, statusKey: UP_AND_IMPL_STATUS_KEY, target });
	if (launchResult.type === "launched") {
		return;
	}
	if (launchResult.type === "cancelled") {
		presentBranchContextMessage(
			pi,
			ctx,
			formatUpAndImplCancelledMessage(mode, launchResult.branch, launchResult.key),
			{ status: "cancelled" },
			"warning",
		);
		return;
	}

	presentBranchContextFailure(pi, ctx, formatUpAndImplLaunchFailureTitle(mode, launchResult.phase), launchResult.message);
}

function formatUpAndImplDryRunMessage(body: string, branch: string, key: string): string {
	return `Dry run: no branch would be created, no plan would be attached, no checkout would happen, no new session would be started, and no implementation prompt would be sent.\n\n${body}\n\nNew-session implementation flow:\n${formatBranchContextUpAndImplFollowUpFlow(branch, key)}`;
}

function formatUpAndImplLaunchFailureTitle(mode: UpAndImplMode, phase: "checkout" | "new-session"): string {
	if (mode === "created") {
		return phase === "checkout"
			? "Created branch context and attached the plan, but failed to check out the branch context."
			: "Created branch context, attached the plan, and checked out the branch context, but failed to start the implementation session.";
	}
	return phase === "checkout"
		? "Reused existing branch context and attached plan, but failed to check out the branch context."
		: "Reused existing branch context, verified the attached plan, and checked out the branch context, but failed to start the implementation session.";
}

function formatUpAndImplCancelledMessage(mode: UpAndImplMode, branch: string, key: string): string {
	const command = formatImplBranchContextCommand(key);
	if (mode === "created") {
		return `Created branch context, attached the plan, and checked out ${branch}, but starting the implementation session was cancelled. Run ${command} to continue.`;
	}
	return `Reused existing branch context, verified the attached plan, and checked out ${branch}, but starting the implementation session was cancelled. Run ${command} to continue.`;
}


async function resolveSelectedSavedPlanFile(
	pi: ExtensionAPI,
	args: CreateBranchContextArgs,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<SelectedSavedPlanFile> {
	const operations = resolveBranchContextOperations(options);
	return operations.resolveSelectedSavedPlanFile(pi, {
		cwd: ctx.cwd,
		planStoreRoot: resolvePlanStoreRootOption(options),
		explicitPath: args.filePath,
		sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		shouldFallbackToLatest: true,
	});
}

function selectedSavedPlanFileInfo(selected: SelectedSavedPlanFile): { filePath: string; fileName: string } {
	if (selected.type === "explicit") {
		return { filePath: selected.filePath, fileName: selected.fileName };
	}
	return { filePath: selected.plan.filePath, fileName: selected.plan.fileName };
}

function deriveBranchContextTargetBranch(
	args: CreateBranchContextArgs,
	slug: string,
	options: BranchContextExtensionOptions,
): BranchContextTargetBranch {
	if (args.branchName !== undefined) {
		const targetBranch = deriveTargetBranch(args.branchName, slug);
		return { targetBranch, branchNameForCreation: targetBranch, isExplicitTargetBranch: true };
	}

	const prefix = options.branchContextPrefix?.trim();
	if (prefix !== undefined && prefix.length > 0) {
		const targetBranch = `${prefix}${slug}`;
		return { targetBranch, branchNameForCreation: targetBranch, isExplicitTargetBranch: false };
	}

	return { targetBranch: deriveTargetBranch(undefined, slug), isExplicitTargetBranch: false };
}

function presentBranchContextFailure(pi: ExtensionAPI, ctx: CommandContext, title: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	presentBranchContextMessage(pi, ctx, `${title}\n\n${message}`, { status: "failure", error: message }, "error");
}

function presentBranchContextMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	content: string,
	details: BranchContextOutputDetails,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage(buildBranchContextOutputMessage(content, details));
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(content, level);
		return;
	}

	if (level === "error") {
		console.error(content);
		return;
	}
	console.log(content);
}

export function registerBranchContextCommands(
	pi: ExtensionAPI,
	options: BranchContextExtensionOptions = {},
): void {
	pi.registerCommand(CREATE_BRANCH_CONTEXT_COMMAND_NAME, {
		description: "Create a branch context using a content-derived slug, then attach the saved plan in Branch Memory.",
		handler: async (args, ctx) => handleCreateBranchContextCommand(pi, args, ctx, options),
	});

	pi.registerCommand(UP_AND_IMPL_COMMAND_NAME, {
		description: "Stack a branch context on the current branch with Graphite, check it out, and implement the attached plan in a fresh Pi session.",
		handler: async (args, ctx) => handleUpAndImplCommand(pi, args, ctx, options),
	});

	pi.registerCommand(IMPL_BRANCH_CONTEXT_COMMAND_NAME, {
		description: "Implement from the attached or latest saved branch-context plan.",
		handler: async (args, ctx) => handleImplBranchContextCommand(pi, args, ctx, options),
	});
}

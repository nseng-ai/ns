import { readFile } from "node:fs/promises";

import { sendCommandProgressOrNotify, registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import { setRuntimeStatus } from "@sdl/pi/runtime/status";
import {
	formatBranchContextGtUpstackImplFollowUpFlow,
	runBranchContextGtUpstackImplLaunch,
} from "./gt/upstack-impl-launch.ts";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@sdl/pi/commands";
import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextOutputMessage,
	buildBranchContextPlanKey,
	buildImplBranchContextPrompt,
	createRealBranchContextContext,
	derivePlanContentSlug,
	deriveTargetBranch,
	formatBranchContextEvidence,
	describeBranchContextGraphiteCreationSteps,
	formatExistingBranchContextReuse,
	formatLoadedAttachedPlanEvidence,
	resolveExistingBranchContextReuse,
	type BranchContextEvidence,
	type BranchContextOutputDetails,
	type BranchCreationMethod,
	type ExistingBranchContextReuse,
	type PlanContentSlugEvidence,
} from "@sdl/branch-context/api";
import {
	NoSavedPlanAvailableError,
	type RepoIdentitySource,
	type SelectedSavedPlanFile,
} from "@sdl/plans/api";
import { formatErrorMessage, optionalEntries, optionalEntry } from "@sdl/core/primitives";
import {
	resolveBranchContextDefaultCreation,
	resolveBranchContextOperations,
	resolvePlanStoreRootOption,
} from "./options.ts";
import type {
	BranchContextExtensionOptions,
	BranchContextOperations,
	CommandContext,
	ExtensionAPI,
	NotifyLevel,
	ReplacedSessionContext,
} from "./host-types.ts";

export const CREATE_BRANCH_CONTEXT_COMMAND_NAME = BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME;
export const GT_UPSTACK_IMPL_COMMAND_NAME = BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME;
export { IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME };
const BRANCH_CONTEXT_STATUS_KEY = CREATE_BRANCH_CONTEXT_COMMAND_NAME;
const GT_UPSTACK_IMPL_STATUS_KEY = GT_UPSTACK_IMPL_COMMAND_NAME;
const IMPL_BRANCH_CONTEXT_STATUS_KEY = IMPL_BRANCH_CONTEXT_COMMAND_NAME;
const IMPL_CURRENT_SAVED_PLAN_STATUS_KEY = IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME;
const GRAPHITE_BRANCH_CREATION_HELP =
	describeBranchContextGraphiteCreationSteps("<current-branch>");

export const CREATE_BRANCH_CONTEXT_USAGE = `Usage: /${CREATE_BRANCH_CONTEXT_COMMAND_NAME} [options] [absolute-or-home-plan-file.md]

Create a branch context from a saved plan. The branch slug is derived from the plan content by a tiny Pi model, then the plan is attached to the branch in Branch Memory as <content-derived-slug>.md.

Options:
  --dry-run          Show the selected plan and target branch without mutating.
  --yes, -y          Compatibility no-op; resolved branch contexts create without confirmation.
  --graphite         Create with the branch-context Graphite method.
  --plain-git        Create with plain Git only; no Graphite tracking.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

${GRAPHITE_BRANCH_CREATION_HELP}

With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.
The saved-plan filename is only a locator. If the model cannot derive and validate a content slug, the command fails without falling back to the filename.`;

export const GT_UPSTACK_IMPL_USAGE = `Usage: /${GT_UPSTACK_IMPL_COMMAND_NAME} [options] [absolute-or-home-plan-file.md]

Stack a branch context on the current branch with the branch-context Graphite method, attach the saved plan, check out that branch with exact git checkout <branch>, start a fresh Pi session, and run /${IMPL_BRANCH_CONTEXT_COMMAND_NAME} <attached-key> for the attached plan in that new session.

Options:
  --dry-run          Show the selected plan and follow-up flow without mutating.
  --yes, -y          Compatibility no-op; resolved branch contexts create without confirmation.
  --graphite         Default: create with the branch-context Graphite method.
  --plain-git        Escape hatch: create with plain Git only; no Graphite tracking, so the branch will not be part of a stack.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

${GRAPHITE_BRANCH_CREATION_HELP}

The current branch must be trunk or a Graphite-tracked branch; otherwise this command fails before creating a branch or attaching a plan.
With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.

This command intentionally models the manual flow: /${CREATE_BRANCH_CONTEXT_COMMAND_NAME} --graphite, git checkout <branch>, /new, then /${IMPL_BRANCH_CONTEXT_COMMAND_NAME} <attached-key> in the new Pi session.`;

export const IMPL_CURRENT_SAVED_PLAN_USAGE = `Usage: /${IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME} [options] [absolute-or-home-plan-file.md]

Launch a fresh Pi implementation session on the current branch from a saved plan. This command does not create, check out, or attach a branch context.

Options:
  --dry-run          Show the selected plan and launch flow without mutating or starting a session.
  --help, -h         Show this help.

With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.
Branch creation flags such as --branch, --graphite, and --plain-git are intentionally unsupported.`;

export interface CreateBranchContextArgs {
	help: boolean;
	dryRun: boolean;
	yes: boolean;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	filePath?: string;
}

export interface ImplCurrentSavedPlanArgs {
	help: boolean;
	dryRun: boolean;
	filePath?: string;
}

interface ImplCurrentSavedPlanPreviewBase {
	savedPlanFileStem: string;
	filePath: string;
	fileName: string;
	planContent: string;
}

interface ExplicitImplCurrentSavedPlanPreview extends ImplCurrentSavedPlanPreviewBase {
	mode: "explicit";
}

interface StoredImplCurrentSavedPlanPreview extends ImplCurrentSavedPlanPreviewBase {
	mode: "latest" | "session";
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	modifiedTimeMs?: number;
	summary?: string;
}

export type ImplCurrentSavedPlanPreview =
	| ExplicitImplCurrentSavedPlanPreview
	| StoredImplCurrentSavedPlanPreview;

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

export type CreateBranchContextPreview =
	| ExplicitCreateBranchContextPreview
	| StoredCreateBranchContextPreview;

interface BranchContextTargetBranch {
	targetBranch: string;
	branchNameForCreation?: string;
	isExplicitTargetBranch: boolean;
}

interface ExplicitSavedPlanEvidence {
	mode: "explicit";
}

interface StoredSavedPlanEvidence {
	mode: "latest" | "session";
	repoRoot: string;
	repoKey: string;
	repoIdentitySource: RepoIdentitySource;
	sourceBranch: string;
	branchKey: string;
	modifiedTimeMs: number;
	summary?: string;
}

type SelectedSavedPlanEvidence = ExplicitSavedPlanEvidence | StoredSavedPlanEvidence;

interface RunCreateBranchContextCommandOptions {
	pi: ExtensionAPI;
	rawArgs: string;
	ctx: CommandContext;
	extensionOptions: BranchContextExtensionOptions;
	usage: string;
	statusKey: string;
	progressMessage: string;
	previewOptions(extensionOptions: BranchContextExtensionOptions): BranchContextExtensionOptions;
	formatDryRunMessage(preview: CreateBranchContextPreview): string;
	onCreated(evidence: BranchContextEvidence): Promise<void> | void;
	handleSelectedPlanError?(args: CreateBranchContextArgs, error: unknown): Promise<boolean>;
	clearStatusOnSelectedPlanError: boolean;
	clearStatusAfterCreated: boolean;
}

class CreateBranchContextUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CreateBranchContextUsageError";
	}
}

function resolveBranchContextContext(
	pi: ExtensionAPI,
	cwd: string,
	options: BranchContextExtensionOptions,
) {
	return options.createBranchContextContext?.(pi, cwd) ?? createRealBranchContextContext({ cwd });
}

export function parseCreateBranchContextArgs(rawArgs: string): CreateBranchContextArgs {
	const parsed: CreateBranchContextArgs = { help: false, dryRun: false, yes: false };
	const tokens = tokenizeCommandArgs(rawArgs);
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

export function parseImplCurrentSavedPlanArgs(rawArgs: string): ImplCurrentSavedPlanArgs {
	const parsed: ImplCurrentSavedPlanArgs = { help: false, dryRun: false };
	const positional: string[] = [];

	for (const token of tokenizeCommandArgs(rawArgs)) {
		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (token === "--branch" || token.startsWith("--branch=")) {
			throw new CreateBranchContextUsageError(
				"--branch is not supported; this command implements on the current branch.",
			);
		}
		if (token === "--graphite" || token === "--plain-git") {
			throw new CreateBranchContextUsageError(
				`${token} is not supported; this command does not create branches.`,
			);
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

function tokenizeCommandArgs(rawArgs: string): string[] {
	return rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

function setBranchCreation(
	args: CreateBranchContextArgs,
	branchCreation: BranchCreationMethod,
): void {
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
	const slugEvidence = await derivePlanContentSlug(pi, {
		filePath: selectedFile.filePath,
		cwd: ctx.cwd,
	});
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
		...(target.branchNameForCreation === undefined
			? {}
			: { branchNameForCreation: target.branchNameForCreation }),
		isExplicitTargetBranch: target.isExplicitTargetBranch,
		branchCreation,
		slugEvidence,
	};

	return { ...base, ...selectedSavedPlanEvidence(selected) };
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

export async function deriveImplCurrentSavedPlanPreview(
	selected: SelectedSavedPlanFile,
): Promise<ImplCurrentSavedPlanPreview> {
	const selectedFile = selectedSavedPlanFileInfo(selected);
	const planContent = await readFile(selectedFile.filePath, "utf8");
	const base = {
		savedPlanFileStem: selected.savedPlanFileStem,
		filePath: selectedFile.filePath,
		fileName: selectedFile.fileName,
		planContent,
	};

	return { ...base, ...selectedSavedPlanEvidence(selected) };
}

export function formatImplCurrentSavedPlanEvidence(preview: ImplCurrentSavedPlanPreview): string {
	const lines = [
		preview.mode === "explicit"
			? "Explicit saved plan file:"
			: preview.mode === "session"
				? "Saved plan from current session:"
				: "Latest saved plan from local plan store:",
	];
	lines.push(`Path: ${preview.filePath}`);
	lines.push(`File name: ${preview.fileName}`);
	lines.push(`Saved-plan file stem: ${preview.savedPlanFileStem}`);
	lines.push(`Selection mode: ${preview.mode}`);
	lines.push("Current branch: inherited from the active Pi session; no checkout is performed.");
	if (preview.mode !== "explicit") {
		lines.push(`Repo key: ${preview.repoKey}`);
		lines.push(`Repo root: ${preview.repoRoot}`);
		lines.push(`Repo identity source: ${preview.repoIdentitySource}`);
		lines.push(`Source branch: ${preview.sourceBranch}`);
		lines.push(`Branch path segment: ${preview.branchKey}`);
		if (preview.modifiedTimeMs !== undefined) {
			lines.push(`Modified: ${new Date(preview.modifiedTimeMs).toISOString()}`);
		}
		if (preview.summary !== undefined) {
			lines.push(`Summary: ${preview.summary}`);
		}
	}
	return lines.join("\n");
}

export function buildImplCurrentSavedPlanPrompt(preview: ImplCurrentSavedPlanPreview): string {
	return `# Saved Plan implementation

A saved plan has been selected for implementation on the current branch. No Branch Context was created, no branch checkout was requested, and no Attached Plan was written.

${formatImplCurrentSavedPlanEvidence(preview)}

## Implementation rules

- Create an implementation checklist before editing.
- Treat the embedded Saved Plan as authoritative unless current repo state proves it stale.
- If the plan is ambiguous or internally inconsistent, quote the ambiguity and ask for clarification instead of guessing.
- Follow normal project rules: read before editing, use precise edits, run relevant validation, and do not commit, push, submit, or publish unless the user explicitly asks.
- Do not call brmem put, brmem copy, brmem delete, or any mutating Branch Memory command merely because this command lives near Branch Context code. If the plan asks for Branch Memory mutation, stop and ask the user.
- If the Saved Plan includes current-state excerpts, scope boundaries, verification gates, or STOP conditions, compare excerpts against live repo state before editing. An excerpt mismatch is a STOP.
- If those contract sections are absent, explicitly recognize the plan as old-format/pre-contract and do not invent gates or half-apply excerpt checks.
- Stop and report instead of guessing on universal STOP triggers: excerpt mismatch; ambiguity or internal inconsistency; a verification gate fails twice after reasonable local attempts; implementation requires touching an out-of-scope file/area; or the plan asks for mutating Branch Memory.
- Before finishing, compare changed files to the plan's scope. Note autofixer-only formatting outside scope separately; intentional executor edits outside scope require user approval.
- Report implemented changes, files changed/tree state, validation results, plan deviations, unresolved follow-up, and for any STOP: observed vs expected plus the exact gate/assumption that failed.

----- BEGIN SAVED PLAN -----
${preview.planContent}
----- END SAVED PLAN -----`;
}

export async function handleImplBranchContextCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	const trimmedArgs = args.trim();
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: "Loading attached branch-context plan…",
	});
	await ctx.waitForIdle();
	setRuntimeStatus(ctx, IMPL_BRANCH_CONTEXT_STATUS_KEY, "loading attached branch-context plan…");
	try {
		const operations = resolveBranchContextOperations(options);
		const params = trimmedArgs.length > 0 ? { requestedKey: trimmedArgs } : {};
		const plan = await operations.loadBranchContextPlan(pi, params, {
			cwd: ctx.cwd,
			context: resolveBranchContextContext(pi, ctx.cwd, options),
			...optionalEntry("planStoreRoot", resolvePlanStoreRootOption(options)),
			sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		});
		presentBranchContextMessage(
			pi,
			ctx,
			formatLoadedAttachedPlanEvidence(plan),
			{ status: "loaded-plan" },
			"info",
		);
		pi.sendUserMessage(buildImplBranchContextPrompt(plan));
	} catch (error) {
		presentBranchContextFailure(pi, ctx, "Failed to load branch-context plan.", error);
	} finally {
		setRuntimeStatus(ctx, IMPL_BRANCH_CONTEXT_STATUS_KEY, undefined);
	}
}

export async function handleImplCurrentSavedPlanCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	let args: ImplCurrentSavedPlanArgs;
	try {
		args = parseImplCurrentSavedPlanArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreateBranchContextUsageError) {
			presentBranchContextMessage(
				pi,
				ctx,
				`Usage error: ${error.message}\n\n${IMPL_CURRENT_SAVED_PLAN_USAGE}`,
				{ status: "usage" },
				"error",
			);
			return;
		}
		throw error;
	}

	if (args.help) {
		await ctx.waitForIdle();
		presentBranchContextMessage(
			pi,
			ctx,
			IMPL_CURRENT_SAVED_PLAN_USAGE,
			{ status: "usage" },
			"info",
		);
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: "Finding saved plan for current-branch implementation…",
	});
	await ctx.waitForIdle();

	let selected: SelectedSavedPlanFile;
	setRuntimeStatus(ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, "finding saved plan…");
	try {
		selected = await resolveSelectedSavedPlanFile(pi, args, ctx, options);
	} catch (error) {
		setRuntimeStatus(ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, undefined);
		presentBranchContextFailure(pi, ctx, "Failed to resolve saved plan file.", error);
		return;
	}

	let preview: ImplCurrentSavedPlanPreview;
	setRuntimeStatus(ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, "reading saved plan…");
	try {
		preview = await deriveImplCurrentSavedPlanPreview(selected);
	} catch (error) {
		setRuntimeStatus(ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, undefined);
		presentBranchContextFailure(pi, ctx, "Failed to read saved plan file.", error);
		return;
	} finally {
		setRuntimeStatus(ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, undefined);
	}

	const evidence = formatImplCurrentSavedPlanEvidence(preview);
	const prompt = buildImplCurrentSavedPlanPrompt(preview);
	if (args.dryRun) {
		presentBranchContextMessage(
			pi,
			ctx,
			`Dry run: no branch would be created, no plan would be attached, no checkout would happen, no new session would be started, and no implementation prompt would be sent.\n\n${evidence}\n\nNew-session implementation flow:\n/new\n/${IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME} ${preview.filePath}`,
			{ status: "dry-run", targetBranch: "current branch", key: preview.savedPlanFileStem },
			"info",
		);
		return;
	}

	presentBranchContextMessage(
		pi,
		ctx,
		`Starting current-branch saved-plan implementation session.\n\n${evidence}`,
		{ status: "loaded-plan" },
		"info",
	);
	const launchResult = await runImplCurrentSavedPlanLaunch({ ctx, prompt });
	if (launchResult.type === "launched") {
		return;
	}
	if (launchResult.type === "cancelled") {
		presentBranchContextMessage(
			pi,
			ctx,
			formatImplCurrentSavedPlanCancelledMessage(preview.filePath),
			{ status: "cancelled" },
			"warning",
		);
		return;
	}

	presentBranchContextFailure(
		pi,
		ctx,
		"Selected the saved plan, but failed to start the implementation session.",
		launchResult.message,
	);
}

export async function handleCreateBranchContextCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	await runCreateBranchContextCommand({
		pi,
		rawArgs,
		ctx,
		extensionOptions: options,
		usage: CREATE_BRANCH_CONTEXT_USAGE,
		statusKey: BRANCH_CONTEXT_STATUS_KEY,
		progressMessage: "Finding saved plan for branch context…",
		previewOptions: (extensionOptions) => extensionOptions,
		formatDryRunMessage: (preview) =>
			`Dry run: no branch was created and no plan was attached.\n\n${formatCreateBranchContextPreview(preview)}`,
		onCreated: (evidence) => {
			presentBranchContextMessage(
				pi,
				ctx,
				formatBranchContextEvidence(evidence),
				{ status: "success", evidence },
				"info",
			);
		},
		clearStatusOnSelectedPlanError: false,
		clearStatusAfterCreated: true,
	});
}

export async function handleGtUpstackImplCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<void> {
	await runCreateBranchContextCommand({
		pi,
		rawArgs,
		ctx,
		extensionOptions: options,
		usage: GT_UPSTACK_IMPL_USAGE,
		statusKey: GT_UPSTACK_IMPL_STATUS_KEY,
		progressMessage: "Finding saved plan for upstack branch-context implementation…",
		previewOptions: (extensionOptions) => ({
			...extensionOptions,
			branchContextDefaultCreation: "graphite",
		}),
		formatDryRunMessage: (preview) =>
			formatGtUpstackImplDryRunMessage(
				formatCreateBranchContextPreview(preview),
				preview.targetBranch,
				preview.planKey,
			),
		handleSelectedPlanError: async (args, error) => {
			if (!(error instanceof NoSavedPlanAvailableError)) {
				return false;
			}
			await handleGtUpstackImplExistingReuse({
				pi,
				args,
				ctx,
				originalError: error,
				extensionOptions: options,
			});
			return true;
		},
		onCreated: async (evidence) => {
			await runGtUpstackImplLaunchTail({
				pi,
				ctx,
				mode: "created",
				target: evidence,
				successBody: formatBranchContextEvidence(evidence),
				outputDetails: { status: "success", evidence },
			});
		},
		clearStatusOnSelectedPlanError: true,
		clearStatusAfterCreated: false,
	});
}

async function runCreateBranchContextCommand(
	commandOptions: RunCreateBranchContextCommandOptions,
): Promise<void> {
	const { pi, rawArgs, ctx, extensionOptions } = commandOptions;
	let args: CreateBranchContextArgs;
	try {
		args = parseCreateBranchContextArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreateBranchContextUsageError) {
			presentBranchContextMessage(
				pi,
				ctx,
				`Usage error: ${error.message}\n\n${commandOptions.usage}`,
				{ status: "usage" },
				"error",
			);
			return;
		}
		throw error;
	}

	if (args.help) {
		await ctx.waitForIdle();
		presentBranchContextMessage(pi, ctx, commandOptions.usage, { status: "usage" }, "info");
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: commandOptions.progressMessage,
	});
	await ctx.waitForIdle();

	const previewOptions = commandOptions.previewOptions(extensionOptions);
	let selected: SelectedSavedPlanFile;
	setRuntimeStatus(ctx, commandOptions.statusKey, "finding saved plan…");
	try {
		selected = await resolveCreateBranchContextPlanFile(pi, args, ctx, previewOptions);
	} catch (error) {
		if (commandOptions.clearStatusOnSelectedPlanError) {
			setRuntimeStatus(ctx, commandOptions.statusKey, undefined);
		}
		if ((await commandOptions.handleSelectedPlanError?.(args, error)) === true) {
			return;
		}
		presentBranchContextFailure(
			pi,
			ctx,
			"Failed to resolve saved plan file or derive branch slug.",
			error,
		);
		return;
	}

	let preview: CreateBranchContextPreview;
	setRuntimeStatus(ctx, commandOptions.statusKey, "deriving branch slug from plan content…");
	try {
		preview = await deriveCreateBranchContextPreview(pi, args, ctx, selected, previewOptions);
	} catch (error) {
		setRuntimeStatus(ctx, commandOptions.statusKey, undefined);
		presentBranchContextFailure(
			pi,
			ctx,
			"Failed to resolve saved plan file or derive branch slug.",
			error,
		);
		return;
	} finally {
		setRuntimeStatus(ctx, commandOptions.statusKey, undefined);
	}

	if (args.dryRun) {
		presentBranchContextMessage(
			pi,
			ctx,
			commandOptions.formatDryRunMessage(preview),
			{ status: "dry-run", targetBranch: preview.targetBranch, key: preview.planKey },
			"info",
		);
		return;
	}

	setRuntimeStatus(ctx, commandOptions.statusKey, "creating branch and attaching plan…");
	let evidence: BranchContextEvidence;
	try {
		evidence = await createBranchContextFromPreview({
			pi,
			preview,
			ctx,
			operations: resolveBranchContextOperations(extensionOptions),
			extensionOptions,
		});
	} catch (error) {
		setRuntimeStatus(ctx, commandOptions.statusKey, undefined);
		presentBranchContextFailure(
			pi,
			ctx,
			"Failed to create branch context and attach the plan.",
			error,
		);
		return;
	}

	try {
		await commandOptions.onCreated(evidence);
	} finally {
		if (commandOptions.clearStatusAfterCreated) {
			setRuntimeStatus(ctx, commandOptions.statusKey, undefined);
		}
	}
}

interface CreateBranchContextFromPreviewOptions {
	pi: ExtensionAPI;
	preview: CreateBranchContextPreview;
	ctx: CommandContext;
	operations: BranchContextOperations;
	extensionOptions: BranchContextExtensionOptions;
}

interface HandleGtUpstackImplExistingReuseOptions {
	pi: ExtensionAPI;
	args: CreateBranchContextArgs;
	ctx: CommandContext;
	originalError: unknown;
	extensionOptions: BranchContextExtensionOptions;
}

async function handleGtUpstackImplExistingReuse(
	options: HandleGtUpstackImplExistingReuseOptions,
): Promise<void> {
	const { pi, args, ctx, originalError, extensionOptions } = options;
	let reuse: ExistingBranchContextReuse;
	setRuntimeStatus(ctx, GT_UPSTACK_IMPL_STATUS_KEY, "finding existing branch context…");
	try {
		const sessionEntries = ctx.sessionManager?.getBranch?.() ?? [];
		reuse = await resolveExistingBranchContextReuse(
			pi,
			args.branchName === undefined
				? { sessionEntries }
				: { explicitBranch: args.branchName, sessionEntries },
			{ cwd: ctx.cwd, context: resolveBranchContextContext(pi, ctx.cwd, extensionOptions) },
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
		setRuntimeStatus(ctx, GT_UPSTACK_IMPL_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		presentBranchContextMessage(
			pi,
			ctx,
			formatGtUpstackImplDryRunMessage(
				formatExistingBranchContextReuse(reuse),
				reuse.branch,
				reuse.key,
			),
			{ status: "dry-run", targetBranch: reuse.branch, key: reuse.key },
			"info",
		);
		return;
	}

	await runGtUpstackImplLaunchTail({
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
	extensionOptions,
}: CreateBranchContextFromPreviewOptions): Promise<BranchContextEvidence> {
	const params: {
		slug: string;
		filePath: string;
		branchCreation: BranchCreationMethod;
		branchName?: string;
		summary?: string;
	} = {
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

	return operations.createBranchContextFromFile(pi, params, {
		cwd: ctx.cwd,
		context: resolveBranchContextContext(pi, ctx.cwd, extensionOptions),
	});
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

type GtUpstackImplMode = "created" | "reused";

type ImplCurrentSavedPlanLaunchResult =
	| { type: "launched"; parentSession?: string }
	| { type: "cancelled"; parentSession?: string }
	| { type: "failed"; message: string; parentSession?: string };

interface ImplCurrentSavedPlanLaunchOptions {
	ctx: CommandContext;
	prompt: string;
}

interface GtUpstackImplLaunchTailOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	mode: GtUpstackImplMode;
	target: Pick<BranchContextEvidence, "branch" | "key">;
	successBody: string;
	outputDetails: BranchContextOutputDetails;
}

async function runGtUpstackImplLaunchTail(options: GtUpstackImplLaunchTailOptions): Promise<void> {
	const { pi, ctx, mode, target } = options;
	presentBranchContextMessage(pi, ctx, options.successBody, options.outputDetails, "info");

	const launchResult = await runBranchContextGtUpstackImplLaunch({
		host: pi,
		ctx,
		statusKey: GT_UPSTACK_IMPL_STATUS_KEY,
		target,
	});
	if (launchResult.type === "launched") {
		return;
	}
	if (launchResult.type === "cancelled") {
		presentBranchContextMessage(
			pi,
			ctx,
			formatGtUpstackImplCancelledMessage(mode, launchResult.branch, launchResult.key),
			{ status: "cancelled" },
			"warning",
		);
		return;
	}

	presentBranchContextFailure(
		pi,
		ctx,
		formatGtUpstackImplLaunchFailureTitle(mode, launchResult.phase),
		launchResult.message,
	);
}

async function runImplCurrentSavedPlanLaunch(
	options: ImplCurrentSavedPlanLaunchOptions,
): Promise<ImplCurrentSavedPlanLaunchResult> {
	let isReplacementSessionActive = false;
	let parentSession: string | undefined;
	try {
		setRuntimeStatus(
			options.ctx,
			IMPL_CURRENT_SAVED_PLAN_STATUS_KEY,
			"starting implementation session…",
		);
		parentSession = options.ctx.sessionManager?.getSessionFile?.();
		const newSessionOptions = {
			...optionalEntry("parentSession", parentSession),
			withSession: async (newCtx: ReplacedSessionContext) => {
				isReplacementSessionActive = true;
				await newCtx.sendUserMessage(options.prompt);
			},
		};
		const result = await options.ctx.newSession(newSessionOptions);
		if (result.cancelled) {
			return {
				type: "cancelled",
				...optionalEntry("parentSession", parentSession),
			};
		}
		return { type: "launched", ...optionalEntry("parentSession", parentSession) };
	} catch (error) {
		if (isReplacementSessionActive) {
			throw error;
		}
		return {
			type: "failed",
			message: error instanceof Error ? error.message : String(error),
			...optionalEntry("parentSession", parentSession),
		};
	} finally {
		if (!isReplacementSessionActive) {
			setRuntimeStatus(options.ctx, IMPL_CURRENT_SAVED_PLAN_STATUS_KEY, undefined);
		}
	}
}

function formatGtUpstackImplDryRunMessage(body: string, branch: string, key: string): string {
	return `Dry run: no branch would be created, no plan would be attached, no checkout would happen, no new session would be started, and no implementation prompt would be sent.\n\n${body}\n\nNew-session implementation flow:\n${formatBranchContextGtUpstackImplFollowUpFlow(branch, key)}`;
}

function formatImplCurrentSavedPlanCancelledMessage(filePath: string): string {
	return `Selected the saved plan, but starting the implementation session was cancelled. Run /${IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME} ${filePath} again, or manually open /new on the current branch and paste/use the saved plan content.`;
}

function formatGtUpstackImplLaunchFailureTitle(
	mode: GtUpstackImplMode,
	phase: "checkout" | "new-session",
): string {
	if (mode === "created") {
		return phase === "checkout"
			? "Created branch context and attached the plan, but failed to check out the branch context."
			: "Created branch context, attached the plan, and checked out the branch context, but failed to start the implementation session.";
	}
	return phase === "checkout"
		? "Reused existing branch context and attached plan, but failed to check out the branch context."
		: "Reused existing branch context, verified the attached plan, and checked out the branch context, but failed to start the implementation session.";
}

function formatGtUpstackImplCancelledMessage(
	mode: GtUpstackImplMode,
	branch: string,
	key: string,
): string {
	const command = formatImplBranchContextCommand(key);
	if (mode === "created") {
		return `Created branch context, attached the plan, and checked out ${branch}, but starting the implementation session was cancelled. Run ${command} to continue.`;
	}
	return `Reused existing branch context, verified the attached plan, and checked out ${branch}, but starting the implementation session was cancelled. Run ${command} to continue.`;
}

async function resolveSelectedSavedPlanFile(
	pi: ExtensionAPI,
	args: { filePath?: string },
	ctx: CommandContext,
	options: BranchContextExtensionOptions,
): Promise<SelectedSavedPlanFile> {
	const operations = resolveBranchContextOperations(options);
	const planStoreRoot = resolvePlanStoreRootOption(options);
	return operations.resolveSelectedSavedPlanFile(pi, {
		cwd: ctx.cwd,
		...optionalEntries({ planStoreRoot, explicitPath: args.filePath }),
		sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		shouldFallbackToLatest: true,
	});
}

function selectedSavedPlanFileInfo(selected: SelectedSavedPlanFile): {
	filePath: string;
	fileName: string;
} {
	if (selected.type === "explicit") {
		return { filePath: selected.filePath, fileName: selected.fileName };
	}
	return { filePath: selected.plan.filePath, fileName: selected.plan.fileName };
}

function selectedSavedPlanEvidence(selected: SelectedSavedPlanFile): SelectedSavedPlanEvidence {
	if (selected.type === "explicit") {
		return { mode: "explicit" };
	}
	return {
		mode: selected.type,
		repoRoot: selected.plan.repoRoot,
		repoKey: selected.plan.repoKey,
		repoIdentitySource: selected.plan.repoIdentitySource,
		sourceBranch: selected.plan.sourceBranch,
		branchKey: selected.plan.branchKey,
		modifiedTimeMs: selected.plan.modifiedTimeMs,
		...(selected.type === "session" && selected.plan.summary !== undefined
			? { summary: selected.plan.summary }
			: {}),
	};
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

function presentBranchContextFailure(
	pi: ExtensionAPI,
	ctx: CommandContext,
	title: string,
	error: unknown,
): void {
	const message = error instanceof Error ? error.message : String(error);
	presentBranchContextMessage(
		pi,
		ctx,
		`${title}\n\n${message}`,
		{ status: "failure", error: message },
		"error",
	);
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
	registerCommandWithImmediateAck({
		host: pi,
		commandName: CREATE_BRANCH_CONTEXT_COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a branch context using a content-derived slug, then attach the saved plan in Branch Memory.",
			handler: async (args, ctx) => handleCreateBranchContextCommand(pi, args, ctx, options),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: GT_UPSTACK_IMPL_COMMAND_NAME,
		commandDefinition: {
			description:
				"Stack a branch context on the current branch with Graphite, check it out, and implement the attached plan in a fresh Pi session.",
			handler: async (args, ctx) => handleGtUpstackImplCommand(pi, args, ctx, options),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME,
		commandDefinition: {
			description:
				"Implement a selected saved plan in a fresh Pi session on the current branch without creating branch context.",
			handler: async (args, ctx) => handleImplCurrentSavedPlanCommand(pi, args, ctx, options),
		},
	});

	registerCommandWithImmediateAck({
		host: pi,
		commandName: IMPL_BRANCH_CONTEXT_COMMAND_NAME,
		commandDefinition: {
			description: "Implement from the attached or latest saved branch-context plan.",
			handler: async (args, ctx) => handleImplBranchContextCommand(pi, args, ctx, options),
		},
	});
}

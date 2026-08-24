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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
	buildHerdrCreateTabArgs,
	buildHerdrCreateWorkspaceArgs,
	buildHerdrPaneRunArgs,
	createHerdrSlotClient,
	launchPreparedBranch,
	type HerdrGateway,
	type PreparedLaunchDestination,
} from "@nseng-ai/herdr/api";
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
	resolveExplicitSavedPlanFile,
	resolvePlanStoreDirectory,
	type ResolvedExplicitSavedPlanFile,
	type ValidatedSessionSavedPlan,
} from "@nseng-ai/plans/api";
import {
	captureSessionPlanDiscoverySkill,
	discoverSessionPlan,
	formatSessionPlanCandidate,
	formatSessionPlanCandidateLabel,
	formatSessionPlanDiscoveryTerminal,
	parseSavedPlanSaveEnvelopeFilePath,
	type SessionPlanCandidate,
	type SessionPlanDiscovery,
	type SessionPlanDiscoveryContext,
} from "@nseng-ai/pi-ns-branch-context/session-plan-discovery";
import { buildPiLaunchCommand, getPiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import {
	prepareLocalGraphiteTrunk,
	type LocalGraphiteTrunkPreparation,
} from "@nseng-ai/extension-kit/tracked-branch-payload";
import type { PiLaunchOptions } from "@nseng-ai/extension-kit/pi-launch";
import { formatCommand } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { CommandContext, NotifyLevel } from "@nseng-ai/extension-kit/pi-types";
import type { SlotClient } from "@nseng-ai/slots/api";
import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/api";

// Command names are used in the Pi layer (pi/impl-plan.ts) via ImplPlanConfig.
import { resolveImplBranchBasis } from "./impl-branch-basis.ts";
import {
	formatImplDestinationNoun,
	prepareImplDestination,
	type ImplDestination,
} from "./impl-destination.ts";
import type { HerdrPiCommandApi } from "./pi-command-api.ts";
import { resolveRepoTrunkBranch } from "./trunk-branch.ts";

export interface ImplPlanConfig {
	commandName: string;
	statusKey: string;
	destination: ImplDestination;
}

export interface HerdrSlotImplPlanOptions {
	planStoreRoot?: string;
	createBranchContextContext?: BranchContextContextFactory<[pi: HerdrPiCommandApi, cwd: string]>;
	slotClient?: SlotClient;
	sessionPlanDiscovery?: SessionPlanDiscoveryContext;
}

interface CommandArgs {
	isDryRun: boolean;
	shouldShowHelp: boolean;
}

export interface HerdrImplPlanContext {
	commands: HerdrPiCommandApi;
	git: Pick<GitGateway, "cachedOriginHeadBranch" | "currentBranch">;
	herdr: HerdrGateway;
	pi: CommandContext;
}

export interface HandleHerdrSlotImplPlanOptions {
	rawArgs: string;
	dependencies: HerdrSlotImplPlanOptions;
	config: ImplPlanConfig;
	notifyProgress: (message: string) => void;
}

let sessionPlanDiscoveryPending = false;

export async function handleHerdrSlotImplPlan(
	context: HerdrImplPlanContext,
	options: HandleHerdrSlotImplPlanOptions,
): Promise<void> {
	const { commands: pi, herdr, pi: ctx } = context;
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

	const preparedDestination = await prepareImplDestination({
		destination: config.destination,
		commandName: config.commandName,
		herdr,
	});
	if (preparedDestination.type === "failed") {
		present(ctx, preparedDestination.message, "error");
		return;
	}
	const destination = preparedDestination.destination;

	await ctx.waitForIdle();

	if (sessionPlanDiscoveryPending) {
		present(ctx, "Session plan discovery is already pending.", "error");
		return;
	}
	if (!parsed.isDryRun && (!ctx.hasUI || ctx.ui.confirm === undefined)) {
		present(
			ctx,
			"Session plan discovery requires Pi UI confirmation. Resume in a UI-capable persisted session.",
			"error",
		);
		return;
	}
	const persistedSessionPath = ctx.sessionManager?.getSessionFile?.();
	if (persistedSessionPath === undefined) {
		present(
			ctx,
			"The current Pi session is not persisted. Save or resume a persisted session before implementing its plan.",
			"error",
		);
		return;
	}
	const skill = captureSessionPlanDiscoverySkill(ctx);
	if (!skill.ok) {
		present(ctx, skill.error.message, "error");
		return;
	}
	const discoveryContext = options.dependencies.sessionPlanDiscovery;
	if (discoveryContext === undefined) {
		present(ctx, "Session plan discovery is not configured for this Herdr command.", "error");
		return;
	}

	sessionPlanDiscoveryPending = true;
	try {
		options.notifyProgress("Discovering the session plan…");
		setStatus(ctx, config, "discovering session plan…");
		const repoRoot = await resolveDiscoveryRepoRoot(pi, ctx.cwd);
		const discovery = await discoverSessionPlan(discoveryContext, {
			repoRoot,
			persistedSessionPath,
			skill: skill.value,
		});
		if (!discovery.ok) {
			present(
				ctx,
				`Session plan discovery failed (${discovery.error.code}): ${discovery.error.message}`,
				"error",
			);
			return;
		}
		const candidate = await chooseSessionPlanCandidate(ctx, discovery.value, parsed.isDryRun);
		if (candidate === undefined) {
			present(ctx, formatSessionPlanDiscoveryTerminal(discovery.value), "info");
			return;
		}
		const candidatePreview = formatSessionPlanCandidate(candidate);
		let validatedReference: ResolvedExplicitSavedPlanFile | undefined;
		if (candidate.type === "saved-plan-reference") {
			validatedReference = await validateDiscoveredSavedPlan(
				pi,
				ctx.cwd,
				candidate.filePath,
				options.dependencies,
			);
		}
		if (parsed.isDryRun) {
			present(
				ctx,
				`Dry run: discovery completed without confirmation, saving, branch, Slot, Herdr, or prompt mutation.\n\n${candidatePreview}\n\nConfirmation needed: yes`,
				"info",
			);
			return;
		}
		const confirmed = await ctx.ui.confirm?.("Use discovered session plan?", candidatePreview);
		if (confirmed !== true) {
			present(ctx, "Session plan discovery was cancelled; nothing was changed.", "info");
			return;
		}
		const selected = await materializeSessionPlanCandidate({
			pi,
			ctx,
			candidate,
			dependencies: options.dependencies,
			validatedReference,
		});
		if (selected === undefined) return;

		const selection = await resolveImplBranchBasis({
			cwd: ctx.cwd,
			git: context.git,
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

		const checkout = selected.checkout;
		const selectedPlan = selected.plan;
		const basis =
			selection.basis === "trunk"
				? await prepareImplTrunkBasis({
						pi,
						git: context.git,
						cwd: checkout.repoRoot,
						notify: options.notifyProgress,
					})
				: ({ type: "current-head" } as const);
		if ("error" in basis) {
			present(ctx, basis.error, "error");
			return;
		}
		if (selection.basis === "current") {
			const revalidated = await context.git.currentBranch({ cwd: checkout.repoRoot });
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
		sessionPlanDiscoveryPending = false;
		setStatus(ctx, config, undefined);
	}
}

interface MaterializedSessionPlan {
	checkout: Awaited<ReturnType<typeof resolvePlanStoreDirectory>>;
	plan: ValidatedSessionSavedPlan;
}

async function resolveDiscoveryRepoRoot(pi: HerdrPiCommandApi, cwd: string): Promise<string> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.type !== "exited" || result.code !== 0 || result.stdout.trim() === "") {
		throw new Error("Cannot discover a session plan outside a Git worktree.");
	}
	return result.stdout.trim();
}

async function chooseSessionPlanCandidate(
	ctx: CommandContext,
	discovery: SessionPlanDiscovery,
	dryRun: boolean,
): Promise<SessionPlanCandidate | undefined> {
	if (discovery.type === "not-found") return undefined;
	if (discovery.type !== "ambiguous") return discovery;
	if (dryRun) {
		present(
			ctx,
			[
				`Dry run: session plan discovery is ambiguous: ${discovery.basis}`,
				...discovery.candidates.map(formatSessionPlanCandidateLabel),
				"No selection or confirmation was requested and nothing was changed.",
			].join("\n"),
			"info",
		);
		return undefined;
	}
	if (ctx.ui.select === undefined) {
		throw new Error("Ambiguous session plan discovery requires Pi UI candidate selection.");
	}
	const labels = discovery.candidates.map(formatSessionPlanCandidateLabel);
	const selected = await ctx.ui.select(
		`Select discovered plan candidate (up to 5): ${discovery.basis}`,
		labels,
	);
	if (selected === undefined) return undefined;
	const index = labels.indexOf(selected);
	return index < 0 ? undefined : discovery.candidates[index];
}

async function validateDiscoveredSavedPlan(
	pi: HerdrPiCommandApi,
	cwd: string,
	filePath: string,
	dependencies: HerdrSlotImplPlanOptions,
): Promise<ResolvedExplicitSavedPlanFile> {
	const resolution = await resolveExplicitSavedPlanFile(pi, {
		cwd,
		explicitPath: filePath,
		...optionalEntry("planStoreRoot", dependencies.planStoreRoot),
	});
	if (resolution.type !== "resolved") {
		throw new Error(`Discovered Saved Plan reference is not safe: ${resolution.message}`);
	}
	return resolution.plan;
}

async function materializeSessionPlanCandidate(options: {
	pi: HerdrPiCommandApi;
	ctx: CommandContext;
	candidate: SessionPlanCandidate;
	dependencies: HerdrSlotImplPlanOptions;
	validatedReference: ResolvedExplicitSavedPlanFile | undefined;
}): Promise<MaterializedSessionPlan | undefined> {
	if (options.candidate.type === "plan-ready") {
		options.pi.sendUserMessage(
			`/ns:plan:save\n\nFocus: ${options.candidate.focus}\nBasis: ${options.candidate.basis}`,
			{ deliverAs: "followUp" },
		);
		present(
			options.ctx,
			"The session is plan-ready. Sent /ns:plan:save as a follow-up; no branch, Slot, or Herdr destination was mutated.",
			"info",
		);
		return undefined;
	}
	const resolved =
		options.candidate.type === "saved-plan-reference"
			? requireValidatedReference(options.validatedReference)
			: await saveAndValidatePresentedPlan(
					options.pi,
					options.ctx.cwd,
					options.candidate,
					options.dependencies,
				);

	const checkout = await resolvePlanStoreDirectory(options.pi, {
		cwd: options.ctx.cwd,
		...optionalEntry("planStoreRoot", options.dependencies.planStoreRoot),
	});
	return {
		checkout,
		plan: {
			directory: checkout,
			slug: resolved.slug,
			filePath: resolved.filePath,
			fileName: basename(resolved.filePath),
			modifiedTimeMs: 0,
		},
	};
}

function requireValidatedReference(
	plan: ResolvedExplicitSavedPlanFile | undefined,
): ResolvedExplicitSavedPlanFile {
	if (plan === undefined) throw new Error("Saved Plan reference was not validated.");
	return plan;
}

async function saveAndValidatePresentedPlan(
	pi: HerdrPiCommandApi,
	cwd: string,
	candidate: Extract<SessionPlanCandidate, { type: "presented-plan" }>,
	dependencies: HerdrSlotImplPlanOptions,
): Promise<ResolvedExplicitSavedPlanFile> {
	const directory = await mkdtemp(join(tmpdir(), "ns-herdr-session-plan-"));
	const contentFile = join(directory, "plan.md");
	try {
		await writeFile(contentFile, candidate.planMarkdown, { encoding: "utf8", mode: 0o600 });
		const result = await pi.exec(
			"enriched-plan",
			[
				"exec",
				"save",
				"--slug",
				candidate.suggestedSlug,
				"--content-file",
				contentFile,
				"--format",
				"json",
			],
			{ cwd },
		);
		if (result.type !== "exited" || result.code !== 0) {
			throw new Error(`Failed to save the presented plan: ${result.stderr.trim() || result.type}`);
		}
		const filePath = parseSavedPlanSaveEnvelopeFilePath(JSON.parse(result.stdout));
		return await validateDiscoveredSavedPlan(pi, cwd, filePath, dependencies);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function implBranchContextContext(
	pi: HerdrPiCommandApi,
	cwd: string,
	options: HerdrSlotImplPlanOptions,
): BranchContextContext {
	return options.createBranchContextContext?.(pi, cwd) ?? createRealBranchContextContext({ cwd });
}

type PreparedImplBasis =
	| { type: "current-head" }
	| { type: "resolved-local-trunk"; preparation: LocalGraphiteTrunkPreparation };

async function prepareImplTrunkBasis(options: {
	pi: HerdrPiCommandApi;
	git: HerdrImplPlanContext["git"];
	cwd: string;
	notify: (message: string) => void;
}): Promise<PreparedImplBasis | { error: string }> {
	const resolution = await resolveRepoTrunkBranch(options.git, { cwd: options.cwd });
	if (resolution.type === "failed") return { error: resolution.message };
	const preparation = await prepareLocalGraphiteTrunk(
		{ pi: options.pi, trunkBranch: resolution.branch },
		{
			cwd: options.cwd,
			notify: options.notify,
		},
	);
	return "error" in preparation ? preparation : { type: "resolved-local-trunk", preparation };
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
	planImplOptions: HerdrSlotImplPlanOptions;
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
				consequence: `No Herdr ${formatImplDestinationNoun(destination.type)} was opened.`,
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
				launchCommand,
			},
			destination,
		},
	);

	if (result.type === "opened") {
		present(
			ctx,
			[
				`Opened plan implementation in Herdr ${formatImplDestinationNoun(destination.type)}.`,
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
		`Dry run: no branch was created, no plan was attached, and no Herdr ${formatImplDestinationNoun(destination.type)} was opened.`,
		"",
		"Selected saved plan:",
		`Path: ${plan.filePath}`,
		`Saved-plan filename slug: ${plan.slug}`,
		`Content-derived branch-context slug: ${operation.slug}`,
		`Repo key: ${plan.directory.repoKey}`,
		`Repo root: ${plan.directory.repoRoot}`,
		`Repo identity source: ${plan.directory.repoIdentitySource}`,
		`Source branch: ${plan.directory.sourceBranch}`,
		`Branch path segment: ${plan.directory.branchKey}`,
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
			branchName: operation.branch,
			description: `herdr ${options.config.commandName.split(":").at(-1) ?? "impl-plan"} from ${options.basis.type === "resolved-local-trunk" ? options.basis.preparation.trunkBranch : plan.directory.sourceBranch}`,
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
	branchName: string;
	description: string;
	launchCommand: string;
}): string {
	if (options.destination === "workspace") {
		return [
			`Herdr workspace: ${options.description}`,
			"Workspace label: [sN:]" + options.branchName,
			formatCommand(
				"herdr",
				buildHerdrCreateWorkspaceArgs({
					cwd: "<slot-worktree-path>",
					label: `<optional-compact-slot-prefix>${options.branchName}`,
				}),
			),
			formatCommand("herdr", buildHerdrPaneRunArgs("<returned-root-pane>", options.launchCommand)),
		].join("\n");
	}

	return [
		`Herdr tab: ${options.description}`,
		"Tab label: " + options.branchName,
		formatCommand(
			"herdr",
			buildHerdrCreateTabArgs({
				workspaceId: "<caller-workspace>",
				cwd: "<slot-worktree-path>",
				label: options.branchName,
				shouldFocus: true,
			}),
		),
		formatCommand("herdr", buildHerdrPaneRunArgs("<returned-root-pane>", options.launchCommand)),
	].join("\n");
}

function formatUsage(config: ImplPlanConfig): string {
	return `Usage: /${config.commandName} [--dry-run]

Discover and confirm the actionable plan in the persisted Pi session, then implement it in a new Herdr ${formatImplDestinationNoun(config.destination)}. Choose the current branch or local Graphite trunk contextually after plan confirmation.

Options:
  --dry-run    Discover and report candidates without confirmation, saving, or mutation.
  --help, -h   Show this help.

Discovery never falls back to the latest Saved Plan. If the session is only plan-ready, this command sends /ns:plan:save and stops.`;
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

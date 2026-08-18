import {
	BRANCH_CONTEXT_NAMESPACE,
	GS_BRANCH_FROM_PLAN_COMMAND_NAME,
	GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	attachBranchContext,
	buildBranchContextCreateOperation,
	createBranchContextContext,
	derivePlanContentSlug,
	formatExistingBranchContextReuse,
	formatImplBranchContextCommand,
	resolveExistingBranchContextReuse,
	selectBranchContextCreateOperationTarget,
	type ExistingBranchContextReuse,
} from "@nseng-ai/branch-context/api";
import {
	createBranchWithProvider,
	type BranchCreationProvider,
} from "@nseng-ai/extension-kit/branch-creation";
import type { BrmemGateway } from "@nseng-ai/brmem";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import {
	NoSavedPlanAvailableError,
	resolveSelectedSavedPlanFile,
	type SelectedSavedPlanFile,
} from "@nseng-ai/plans/api";

import { RealGsConsumerGateway, type GsConsumerGateway } from "./gs-gateway.ts";
import type { CommandContext, ExtensionAPI } from "./host-types.ts";
import { createGsPiCommandApi, type GsPiCommandApi } from "./pi-command-api.ts";

export { GS_BRANCH_FROM_PLAN_COMMAND_NAME, GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME };
const STATUS_KEY = GS_BRANCH_FROM_PLAN_COMMAND_NAME;
const IMPL_STATUS_KEY = GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME;

export const GS_BRANCH_FROM_PLAN_USAGE = `Usage: /${GS_BRANCH_FROM_PLAN_COMMAND_NAME} [options] [absolute-or-home-plan-file.md]

Create a GitHub Stacks branch from a Saved Plan, attach it as Branch Context, then restore the original branch.

Options:
  --dry-run          Resolve the plan and target without mutating Git, GitHub Stacks, or Branch Memory.
  --branch <name>    Use an explicit target branch; collisions are refused.
  --help, -h         Show this help.`;

export const GS_BRANCH_AND_IMPL_FROM_PLAN_USAGE = `Usage: /${GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME} [options] [absolute-or-home-plan-file.md]

Create or reuse a GitHub Stacks branch with Attached Plan, keep it checked out, then open a fresh Pi session and run /${IMPL_BRANCH_CONTEXT_COMMAND_NAME} <key>.

Options:
  --dry-run          Show exact topology, checkout, session, and dispatch actions without mutation.
  --branch <name>    Use an explicit target branch; collisions are refused for creation and verified for reuse.
  --help, -h         Show this help.`;

export interface GsExtensionContext {
	git: GitGateway;
	brmem: BrmemGateway;
	gs: GsConsumerGateway;
}

export interface GsExtensionOperations {
	resolveSelectedSavedPlanFile: typeof resolveSelectedSavedPlanFile;
	derivePlanContentSlug: typeof derivePlanContentSlug;
	resolveExistingBranchContextReuse(
		pi: GsPiCommandApi,
		options: { explicitBranch?: string; sessionEntries: unknown[] },
		context: {
			cwd: string;
			context: { commands: GsPiCommandApi; git: GitGateway; brmem: BrmemGateway };
		},
	): Promise<ExistingBranchContextReuse>;
}

export interface GsExtensionOptions {
	planStoreRoot?: string;
	createContext?(pi: GsPiCommandApi, cwd: string): GsExtensionContext;
	operations?: Partial<GsExtensionOperations>;
}

interface CommandArgs {
	help: boolean;
	dryRun: boolean;
	branchName?: string;
	filePath?: string;
}

export const gsExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: GS_BRANCH_FROM_PLAN_COMMAND_NAME,
		workflow: "Create a GitHub Stacks branch from a Saved Plan and attach Branch Context",
		parity: "WAIVED",
		fallback:
			"Create the stack branch with gh stack, then attach with ns branch-context exec attach.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gs",
		sourceModule: "gs-extension",
		notes:
			"The Pi command preserves the Pi exec telemetry channel and restores the original checkout.",
	},
	{
		kind: "command",
		surface: GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME,
		workflow: "Create or reuse a GitHub Stacks branch and implement its Attached Plan",
		parity: "WAIVED",
		fallback: "Create or select the branch, then run the attached-plan implementation command.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gs",
		sourceModule: "gs-extension",
		notes: "Provider-local composition preserves Pi exec telemetry and fresh-session replacement.",
	},
] as const);

export default function registerGsExtension(
	pi: ExtensionAPI,
	options: GsExtensionOptions = {},
): void {
	const commandApi = createGsPiCommandApi(pi);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: GS_BRANCH_FROM_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Create a GitHub Stacks branch from a Saved Plan and attach Branch Context",
			handler: async (rawArgs, ctx) =>
				handleGsBranchFromPlan(commandApi, rawArgs, ctx, options, false),
		},
		options: { delivery: "message" },
	});
	registerCommandWithImmediateAck({
		host: pi,
		commandName: GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Create or reuse a GitHub Stacks branch and implement its Attached Plan",
			handler: async (rawArgs, ctx) =>
				handleGsBranchFromPlan(commandApi, rawArgs, ctx, options, true),
		},
		options: { delivery: "message" },
	});
}

async function handleGsBranchFromPlan(
	pi: GsPiCommandApi,
	rawArgs: string,
	ctx: CommandContext,
	options: GsExtensionOptions,
	shouldLaunch: boolean,
): Promise<void> {
	let args: CommandArgs;
	try {
		args = parseArgs(rawArgs);
	} catch (error) {
		present(
			pi,
			ctx,
			`Usage error: ${formatErrorMessage(error)}\n\n${shouldLaunch ? GS_BRANCH_AND_IMPL_FROM_PLAN_USAGE : GS_BRANCH_FROM_PLAN_USAGE}`,
			"error",
		);
		return;
	}
	if (args.help) {
		await ctx.waitForIdle();
		present(
			pi,
			ctx,
			shouldLaunch ? GS_BRANCH_AND_IMPL_FROM_PLAN_USAGE : GS_BRANCH_FROM_PLAN_USAGE,
			"info",
		);
		return;
	}

	await ctx.waitForIdle();
	const statusKey = shouldLaunch ? IMPL_STATUS_KEY : STATUS_KEY;
	ctx.ui.setStatus(statusKey, "preparing Saved Plan…");
	try {
		const context = createContext(pi, ctx.cwd, options);
		const operations = resolveOperations(options);
		let selected: SelectedSavedPlanFile;
		try {
			selected = await operations.resolveSelectedSavedPlanFile(pi, {
				cwd: ctx.cwd,
				shouldFallbackToLatest: true,
				sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
				git: context.git,
				...optionalEntry("explicitPath", args.filePath),
				...optionalEntry("planStoreRoot", options.planStoreRoot),
			});
		} catch (error) {
			if (!shouldLaunch || !(error instanceof NoSavedPlanAvailableError)) throw error;
			const reuse = await operations.resolveExistingBranchContextReuse(
				pi,
				args.branchName === undefined
					? { sessionEntries: ctx.sessionManager?.getBranch?.() ?? [] }
					: {
							explicitBranch: args.branchName,
							sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
						},
				{ cwd: ctx.cwd, context: { commands: pi, git: context.git, brmem: context.brmem } },
			);
			if (args.dryRun) {
				present(
					pi,
					ctx,
					formatImplDryRun(
						formatExistingBranchContextReuse(reuse),
						"provider skipped",
						reuse.branch,
						reuse.key,
					),
					"info",
				);
				return;
			}
			await launchImplementation(pi, ctx, context.git, reuse.branch, reuse.key, "reused");
			return;
		}
		const file = selectedFile(selected);
		const slug = await operations.derivePlanContentSlug(pi, {
			filePath: file.filePath,
			cwd: ctx.cwd,
		});
		const initial = buildBranchContextCreateOperation({
			slug: slug.slug,
			filePath: file.filePath,
			creation: { type: "plain-git-current-head" },
			...optionalEntry("branchName", args.branchName),
		});
		const operation = await selectBranchContextCreateOperationTarget({
			cwd: ctx.cwd,
			operation: initial,
			git: context.git,
			brmem: context.brmem,
			isExplicitTargetBranch: args.branchName !== undefined,
		});
		const topology = await resolveTopologyAction(context, ctx.cwd);
		if (args.dryRun) {
			present(
				pi,
				ctx,
				shouldLaunch
					? formatImplDryRun(
							`Saved Plan: ${file.filePath}`,
							topology.action,
							operation.branch,
							operation.key,
						)
					: [
							"Dry run: no GitHub Stacks, Git, checkout, or Branch Memory mutation occurred.",
							`Saved Plan: ${file.filePath}`,
							`Target branch: ${operation.branch}`,
							`Namespace: ${operation.namespace}`,
							`Key: ${operation.key}`,
							`Topology action: ${topology.action}`,
						].join("\n"),
				"info",
			);
			return;
		}
		ctx.ui.setStatus(statusKey, "creating GitHub Stacks branch…");
		const result = await executeGsBranchFromPlan({
			cwd: ctx.cwd,
			context,
			restoreOriginal: !shouldLaunch,
			operation: { branch: operation.branch, key: operation.key, sourceFile: file.filePath },
		});
		present(pi, ctx, result.message, result.type === "success" ? "info" : "error", result);
		if (result.type === "success" && shouldLaunch) {
			await launchImplementation(pi, ctx, context.git, result.targetBranch, result.key, "created");
		}
	} catch (error) {
		present(
			pi,
			ctx,
			`Failed to create GitHub Stacks branch from Saved Plan.\n\n${formatErrorMessage(error)}`,
			"error",
		);
	} finally {
		ctx.ui.setStatus(statusKey, undefined);
	}
}

export type GsBranchFromPlanResult =
	| { type: "success"; message: string; originalBranch: string; targetBranch: string; key: string }
	| { type: "failure"; message: string; targetBranch: string; key: string };

export async function executeGsBranchFromPlan(options: {
	cwd: string;
	context: GsExtensionContext;
	operation: { branch: string; key: string; sourceFile: string };
	restoreOriginal?: boolean;
}): Promise<GsBranchFromPlanResult> {
	const { git, gs, brmem } = options.context;
	const original = await git.currentBranch({ cwd: options.cwd });
	if (original.type === "detached")
		return failure(
			options,
			"Detached checkout; check out a named branch before creating a GitHub Stack.",
		);
	if (original.type === "failure") return failure(options, original.error.message);
	const trunk = await git.cachedOriginHeadBranch({ cwd: options.cwd });
	if (trunk.type === "missing")
		return failure(
			options,
			"Could not resolve trunk from cached origin/HEAD; set the remote default branch before retrying.",
		);
	if (trunk.type === "error") return failure(options, trunk.error.message);
	const start = await git.headCommit({ cwd: options.cwd });
	if (!start.ok) return failure(options, start.error.message);

	const provider = gsBranchCreationProvider(gs, {
		currentBranch: original.branch,
		trunkBranch: trunk.value,
	});
	const creation = await createBranchWithProvider({
		git,
		provider,
		request: { cwd: options.cwd, targetBranch: options.operation.branch, startPoint: start.value },
	});
	if (creation.type === "failed") {
		if (!creation.branchObserved) return failure(options, creation.error.message);
		return creation.stage === "provider"
			? providerPostCreationFailure(options, original.branch, creation.error.message)
			: postCreationFailure(options, original.branch, creation.error.message);
	}
	const checkedOut = await git.currentBranch({ cwd: options.cwd });
	if (checkedOut.type !== "branch" || checkedOut.branch !== options.operation.branch) {
		return postCreationFailure(
			options,
			original.branch,
			`GitHub Stacks did not leave the exact target checked out; observed ${checkedOut.type === "branch" ? checkedOut.branch : checkedOut.type}.`,
		);
	}

	let attached = false;
	let attachFailure: string | undefined;
	try {
		await attachBranchContext({
			brmem,
			cwd: options.cwd,
			branch: options.operation.branch,
			key: options.operation.key,
			sourceFile: options.operation.sourceFile,
		});
		attached = true;
	} catch (error) {
		attachFailure = formatErrorMessage(error);
	}
	if (options.restoreOriginal === false) {
		if (!attached) {
			return failure(
				options,
				[
					"GitHub Stacks target exists, but Branch Context attachment failed. No rollback was attempted.",
					`Target branch: ${options.operation.branch}`,
					`Key: ${options.operation.key}`,
					attachFailure ?? "Unknown attachment failure.",
				].join("\n"),
			);
		}
		return {
			type: "success",
			message: [
				"Created GitHub Stacks branch and attached Branch Context; target remains checked out.",
				`Target branch: ${options.operation.branch}`,
				`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
				`Key: ${options.operation.key}`,
			].join("\n"),
			originalBranch: original.branch,
			targetBranch: options.operation.branch,
			key: options.operation.key,
		};
	}
	const restore = await git.checkout({ cwd: options.cwd, branch: original.branch });
	if (!restore.ok) {
		return failure(
			options,
			[
				attached
					? "Branch and attachment succeeded, but restoring the original checkout failed."
					: "Branch creation succeeded and attachment failed; restoring the original checkout also failed.",
				`Original branch: ${original.branch}`,
				`Target branch: ${options.operation.branch}`,
				`Key: ${options.operation.key}`,
				...(attachFailure === undefined ? [] : [`Attachment failure: ${attachFailure}`]),
				`Recovery: git checkout ${shellQuote(original.branch)}`,
			].join("\n"),
		);
	}
	if (!attached) {
		return failure(
			options,
			[
				"GitHub Stacks target exists, but Branch Context attachment failed. No rollback was attempted.",
				`Target branch: ${options.operation.branch}`,
				`Key: ${options.operation.key}`,
				attachFailure ?? "Unknown attachment failure.",
			].join("\n"),
		);
	}
	return {
		type: "success",
		message: [
			"Created GitHub Stacks branch, attached Branch Context, and restored the original branch.",
			`Original branch: ${original.branch}`,
			`Target branch: ${options.operation.branch}`,
			`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`,
			`Key: ${options.operation.key}`,
		].join("\n"),
		originalBranch: original.branch,
		targetBranch: options.operation.branch,
		key: options.operation.key,
	};
}

async function resolveTopologyAction(
	context: GsExtensionContext,
	cwd: string,
): Promise<{ action: "add" | "init" | "init/adopt" }> {
	const current = await context.git.currentBranch({ cwd });
	if (current.type === "detached")
		throw new Error("Detached checkout; check out a named branch first.");
	if (current.type === "failure") throw new Error(current.error.message);
	const trunk = await context.git.cachedOriginHeadBranch({ cwd });
	if (trunk.type === "missing") throw new Error("Could not resolve trunk from cached origin/HEAD.");
	if (trunk.type === "error") throw new Error(trunk.error.message);
	const inspection = await context.gs.inspectLocalStack({ cwd });
	if (!inspection.ok) throw new Error(inspection.error.message);
	if (inspection.value.type === "stacked") {
		if (inspection.value.currentBranch !== current.branch) {
			throw new Error(
				`GitHub Stacks topology identifies ${inspection.value.currentBranch} as current, but Git identifies ${current.branch}; refusing ambiguous mutation.`,
			);
		}
		return { action: "add" };
	}
	return { action: current.branch === trunk.value ? "init" : "init/adopt" };
}

export async function launchImplementation(
	pi: GsPiCommandApi,
	ctx: CommandContext,
	git: Pick<GitGateway, "checkout">,
	branch: string,
	key: string,
	mode: "created" | "reused",
): Promise<void> {
	const checkout = await git.checkout({ cwd: ctx.cwd, branch });
	if (!checkout.ok) {
		present(
			pi,
			ctx,
			`${mode === "created" ? "Created" : "Reused"} Attached Plan, but exact checkout failed.\nTarget: ${branch}\nKey: ${key}\nRecovery: git checkout ${shellQuote(branch)} then run ${formatImplBranchContextCommand(key)}\n${checkout.error.message}`,
			"error",
		);
		return;
	}
	let activated = false;
	const parentSession = ctx.sessionManager?.getSessionFile?.();
	try {
		if (ctx.newSession === undefined) throw new Error("Pi session replacement is unavailable.");
		const result = await ctx.newSession({
			...optionalEntry("parentSession", parentSession),
			withSession: async (newCtx) => {
				activated = true;
				await newCtx.sendUserMessage(formatImplBranchContextCommand(key));
			},
		});
		if (result.cancelled) {
			present(
				pi,
				ctx,
				`Fresh session was cancelled; ${branch} remains checked out. Run ${formatImplBranchContextCommand(key)} to continue.`,
				"warning",
			);
		}
	} catch (error) {
		if (activated) throw error;
		present(
			pi,
			ctx,
			`Fresh session failed before activation; ${branch} remains checked out.\nTarget: ${branch}\nKey: ${key}\nRecovery: run ${formatImplBranchContextCommand(key)}\n${formatErrorMessage(error)}`,
			"error",
		);
	}
}

function formatImplDryRun(body: string, action: string, branch: string, key: string): string {
	return [
		"Dry run: no GS, Git, Branch Memory, checkout, or session mutation occurred.",
		body,
		`Topology action: ${action}`,
		`Target branch: ${branch}`,
		`Key: ${key}`,
		"Follow-up flow:",
		`git checkout ${branch}`,
		"/new (with parent-session evidence)",
		formatImplBranchContextCommand(key),
	].join("\n");
}

function gsBranchCreationProvider(
	gs: GsConsumerGateway,
	facts: { currentBranch: string; trunkBranch: string },
): BranchCreationProvider {
	return {
		id: "github-stacks",
		async createBranch(request) {
			const inspection = await gs.inspectLocalStack({
				cwd: request.cwd,
				...optionalEntry("signal", request.signal),
			});
			if (!inspection.ok) return { ok: false, error: inspection.error, branchCreated: false };
			const result =
				inspection.value.type === "stacked"
					? inspection.value.currentBranch !== facts.currentBranch
						? {
								ok: false as const,
								error: {
									code: "gs-current-branch-mismatch",
									message: `GitHub Stacks topology identifies ${inspection.value.currentBranch} as current, but Git identifies ${facts.currentBranch}; refusing ambiguous mutation.`,
								},
							}
						: await gs.addAboveCurrentStack({
								cwd: request.cwd,
								targetBranch: request.targetBranch,
								...optionalEntry("signal", request.signal),
							})
					: await gs.initializeStack({
							cwd: request.cwd,
							trunkBranch: facts.trunkBranch,
							branches:
								facts.currentBranch === facts.trunkBranch
									? [request.targetBranch]
									: [facts.currentBranch, request.targetBranch],
							...optionalEntry("signal", request.signal),
						});
			return result.ok ? { ok: true } : { ok: false, error: result.error, branchCreated: false };
		},
	};
}

function resolveOperations(options: GsExtensionOptions): GsExtensionOperations {
	return {
		resolveSelectedSavedPlanFile:
			options.operations?.resolveSelectedSavedPlanFile ?? resolveSelectedSavedPlanFile,
		derivePlanContentSlug: options.operations?.derivePlanContentSlug ?? derivePlanContentSlug,
		resolveExistingBranchContextReuse:
			options.operations?.resolveExistingBranchContextReuse ?? resolveExistingBranchContextReuse,
	};
}

function createContext(
	pi: GsPiCommandApi,
	cwd: string,
	options: GsExtensionOptions,
): GsExtensionContext {
	if (options.createContext !== undefined) return options.createContext(pi, cwd);
	const base = createBranchContextContext(pi, { cwd });
	return { git: base.git, brmem: base.brmem, gs: new RealGsConsumerGateway(pi) };
}

function selectedFile(selected: SelectedSavedPlanFile): { filePath: string } {
	return selected.type === "explicit"
		? { filePath: selected.filePath }
		: { filePath: selected.plan.filePath };
}

function failure(
	options: { operation: { branch: string; key: string } },
	message: string,
): GsBranchFromPlanResult {
	return {
		type: "failure",
		message,
		targetBranch: options.operation.branch,
		key: options.operation.key,
	};
}

function providerPostCreationFailure(
	options: { operation: { branch: string; key: string } },
	originalBranch: string,
	detail: string,
): GsBranchFromPlanResult {
	return failure(
		options,
		[
			"GitHub Stacks provider failed after the target branch appeared. No rollback was attempted.",
			`Original branch: ${originalBranch}`,
			`Target branch: ${options.operation.branch}`,
			`Key: ${options.operation.key}`,
			`Recovery: git checkout ${shellQuote(originalBranch)}`,
			`Provider failure: ${detail}`,
		].join("\n"),
	);
}

function postCreationFailure(
	options: { operation: { branch: string; key: string } },
	originalBranch: string,
	detail: string,
): GsBranchFromPlanResult {
	return failure(
		options,
		[
			"GitHub Stacks branch creation partially succeeded, but a Git postcondition failed. No rollback was attempted.",
			`Original branch: ${originalBranch}`,
			`Target branch: ${options.operation.branch}`,
			`Key: ${options.operation.key}`,
			`Recovery: git checkout ${shellQuote(originalBranch)}`,
			`Postcondition failure: ${detail}`,
		].join("\n"),
	);
}

function parseArgs(rawArgs: string): CommandArgs {
	const result: CommandArgs = { help: false, dryRun: false };
	const positional: string[] = [];
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--help" || token === "-h") result.help = true;
		else if (token === "--dry-run") result.dryRun = true;
		else if (token === "--branch") {
			const branch = tokens[index + 1];
			if (branch === undefined || branch.startsWith("-"))
				throw new Error("Missing value for --branch.");
			result.branchName = branch;
			index += 1;
		} else if (token?.startsWith("--branch=")) {
			const branch = token.slice("--branch=".length);
			if (branch.length === 0) throw new Error("Missing value for --branch.");
			result.branchName = branch;
		} else if (token?.startsWith("-")) throw new Error(`Unknown flag: ${token}`);
		else if (token !== undefined) positional.push(token);
	}
	if (positional.length > 1) throw new Error("Expected at most one Saved Plan path.");
	if (positional[0] !== undefined) result.filePath = positional[0];
	return result;
}

function present(
	pi: GsPiCommandApi,
	ctx: CommandContext,
	content: string,
	level: "info" | "warning" | "error",
	details?: unknown,
): void {
	if (pi.rawPi.sendMessage !== undefined) {
		pi.rawPi.sendMessage({ customType: "ns.gs.branch-from-plan", content, display: true, details });
		return;
	}
	ctx.ui.notify(content, level);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

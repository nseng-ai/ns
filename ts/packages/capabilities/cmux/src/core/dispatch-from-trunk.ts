import {
	commandSucceeded,
	type CommandExecApi,
	formatCommand,
	formatCommandFailure,
} from "@nseng-ai/foundation/command";
import { isAbsolute, resolve } from "node:path";

import {
	planLocalBranchRefreshFromWorktrees,
	type GitBranchUpstream,
	type GitGateway,
	type LocalBranchRefreshPlan,
} from "@nseng-ai/foundation/git";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import {
	createGraphiteMetadataDbAccess,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	resolveGraphiteTrunkBranchFromTopology,
	type GraphiteMetadataDbAccess,
} from "@nseng-ai/capability-kit/graphite/metadata";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
import {
	buildLaunchPrompt,
	createTrackedBranchFromResolvedParent,
	dispatchTrackedBranchPrompt,
	resolveDispatchPromptPayloadOptions,
	runText,
	type BranchCreateResult,
} from "./dispatch-prompt.ts";
import type { SlotClient } from "@nseng-ai/slots/api";
import type { CommandContext } from "@nseng-ai/capability-kit/cmux/types";
import type { CccPiCommandApi } from "./pi-command-api.ts";

type DispatchFromTrunkRuntime = CommandExecApi & Pick<CccPiCommandApi, "getThinkingLevel">;

const COMMAND_NAME = CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;
const GIT_TRUNK_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

interface GraphiteTrunkResolutionContext {
	pi: CommandExecApi;
	cwd: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	metadataDbAccess: GraphiteMetadataDbAccess;
}

export async function handleCccSlotDispatchFromTrunk(options: {
	pi: DispatchFromTrunkRuntime;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
	slotClient?: SlotClient;
	metadataDbAccess?: GraphiteMetadataDbAccess;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	const { pi, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	await ctx.waitForIdle();
	const branch = await createTrackedBranchFromTrunkForPrompt({
		pi,
		cwd: ctx.cwd,
		prompt,
		graphite: options.graphite,
		git: options.git,
		notify: options.notifyProgress,
		...optionalEntry("metadataDbAccess", options.metadataDbAccess),
	});
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	await dispatchTrackedBranchPrompt({
		pi,
		ctx,
		branch,
		content: buildLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		description: `dispatch-from-trunk from ${branch.parentBranch}`,
		payloadOptions,
		...optionalEntry("slotClient", options.slotClient),
		notifyProgress: options.notifyProgress,
	});
}

export async function createTrackedBranchFromTrunkForPrompt(options: {
	pi: CommandExecApi;
	cwd: string;
	prompt: string;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
	notify?: (message: string) => void;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}): Promise<BranchCreateResult | { error: string }> {
	const { pi, cwd, prompt, notify } = options;
	notify?.("Resolving Graphite trunk…");
	const trunk = await resolveGraphiteTrunkBranch({
		pi,
		cwd,
		graphite: options.graphite,
		metadataDbAccess: options.metadataDbAccess ?? createGraphiteMetadataDbAccess(),
	});
	if ("error" in trunk) return trunk;
	const trunkBranch = trunk.branch;

	notify?.("Resolving configured Git upstream…");
	const upstream = await options.git.branchUpstream({ cwd, branch: trunkBranch });
	if (upstream.type === "missing") {
		return {
			error: [
				`Graphite trunk ${trunkBranch} has no configured Git upstream; no branch was created.`,
				`Configure one with git branch --set-upstream-to=<remote>/<remote-branch> ${trunkBranch}, then retry.`,
			].join("\n"),
		};
	}
	if (upstream.type === "error") {
		return {
			error: [
				`Could not inspect the configured Git upstream for Graphite trunk ${trunkBranch}; no branch was created.`,
				upstream.error.message,
			].join("\n"),
		};
	}

	notify?.("Refreshing Graphite trunk…");
	const refresh = await refreshLocalTrunkBranch({
		pi,
		cwd,
		trunkBranch,
		upstream: upstream.value,
	});
	if (!refresh.ok) {
		return {
			error: [
				`Graphite trunk refresh failed for ${trunkBranch}; no branch was created.`,
				refresh.message,
			].join("\n"),
		};
	}

	const startPoint = await runText(pi, cwd, "git", ["rev-parse", trunkBranch]);
	if (!startPoint.ok) {
		return { error: `Could not resolve refreshed trunk ${trunkBranch}: ${startPoint.message}` };
	}

	notify?.("Generating branch name…");
	return createTrackedBranchFromResolvedParent({
		pi,
		cwd,
		prompt,
		parentBranch: trunkBranch,
		startPoint: startPoint.text,
		startRef: trunkBranch,
		createFailureContext: `from refreshed trunk ${trunkBranch}`,
	});
}

async function resolveGraphiteTrunkBranch(
	context: GraphiteTrunkResolutionContext,
): Promise<{ branch: string } | { error: string }> {
	const trunk = await context.graphite.trunkBranch({ cwd: context.cwd });
	if (trunk.ok) return { branch: trunk.branch };
	if (trunk.reason !== "detached-head") {
		return { error: `Could not resolve Graphite trunk.\n${trunk.error.message}` };
	}

	const metadataTrunk = await resolveGraphiteTrunkBranchFromMetadata(context);
	if ("branch" in metadataTrunk) return metadataTrunk;
	return { error: [trunk.error.message, metadataTrunk.error].join("\n\n") };
}

async function resolveGraphiteTrunkBranchFromMetadata(
	context: GraphiteTrunkResolutionContext,
): Promise<{ branch: string } | { error: string }> {
	const commonDir = await runText(context.pi, context.cwd, "git", [
		"rev-parse",
		"--git-common-dir",
	]);
	if (!commonDir.ok) {
		return { error: `Could not inspect Graphite metadata fallback: ${commonDir.message}` };
	}
	const commonGitDir = commonDir.text.trim();
	const dbPath = graphiteMetadataDbPath(
		isAbsolute(commonGitDir) ? commonGitDir : resolve(context.cwd, commonGitDir),
	);
	if (!context.metadataDbAccess.exists(dbPath)) {
		return {
			error: `Graphite metadata fallback unavailable: metadata store not found at ${dbPath}`,
		};
	}
	const schemaRows = context.metadataDbAccess.queryJson(
		dbPath,
		GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	);
	if (!schemaRows.ok) {
		return { error: `Graphite metadata fallback failed: ${schemaRows.error.message}` };
	}
	if (!hasExpectedGraphiteBranchMetadataSchema(schemaRows.value)) {
		return { error: "Graphite metadata fallback failed: branch_metadata schema mismatch." };
	}
	const metadataRows = context.metadataDbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_QUERY);
	if (!metadataRows.ok) {
		return { error: `Graphite metadata fallback failed: ${metadataRows.error.message}` };
	}
	const parsed = parseGraphiteBranchMetadataRows(metadataRows.value);
	if (parsed.type === "not_array") {
		return { error: "Graphite metadata fallback failed: branch_metadata rows were not an array." };
	}
	const resolution = resolveGraphiteTrunkBranchFromTopology(parsed.topology);
	if (resolution.type === "trunk") return { branch: resolution.branch };
	if (resolution.type === "none") {
		return { error: "Graphite metadata fallback found no trunk marker." };
	}
	return {
		error: `Graphite metadata fallback found multiple trunk markers: ${resolution.branches.join(", ")}`,
	};
}

async function refreshLocalTrunkBranch(options: {
	pi: CommandExecApi;
	cwd: string;
	trunkBranch: string;
	upstream: GitBranchUpstream;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const { pi, cwd, trunkBranch } = options;
	const worktrees = await pi.exec("git", ["worktree", "list", "--porcelain"], {
		cwd,
		timeout: GIT_TRUNK_REFRESH_TIMEOUT_MS,
	});
	if (!commandSucceeded(worktrees)) {
		return {
			ok: false,
			message: formatCommandFailure(
				"Could not inspect Git worktrees.",
				"git worktree list --porcelain",
				worktrees,
			),
		};
	}

	const plan = planLocalBranchRefreshFromWorktrees({
		branch: trunkBranch,
		cwd,
		upstream: options.upstream,
		worktreePorcelain: worktrees.stdout,
	});
	const refresh = await pi.exec("git", plan.args, {
		cwd: plan.cwd,
		timeout: GIT_TRUNK_REFRESH_TIMEOUT_MS,
	});
	if (commandSucceeded(refresh)) return { ok: true };
	return {
		ok: false,
		message: [
			formatCommandFailure(
				formatTrunkRefreshFailureTitle(plan, trunkBranch),
				formatCommand("git", plan.args),
				refresh,
			),
			`Cwd: ${plan.cwd}`,
		].join("\n"),
	};
}

function formatTrunkRefreshFailureTitle(plan: LocalBranchRefreshPlan, trunkBranch: string): string {
	if (plan.type === "pull-checked-out-branch") {
		return `Could not pull checked-out trunk branch ${trunkBranch}.`;
	}

	return `Could not fetch trunk branch ${trunkBranch}.`;
}

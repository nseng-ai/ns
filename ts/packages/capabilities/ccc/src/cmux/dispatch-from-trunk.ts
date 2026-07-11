import {
	commandSucceeded,
	execApiToCommandRunner,
	type CommandExecApi,
	formatCommand,
	formatCommandFailure,
} from "@nseng-ai/foundation/command";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import { isAbsolute, resolve } from "node:path";

import {
	planLocalBranchRefreshFromWorktrees,
	type LocalBranchRefreshPlan,
} from "@nseng-ai/foundation/git";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
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

import { CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
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

const COMMAND_NAME = CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;
const GIT_TRUNK_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

interface GraphiteTrunkResolutionContext {
	pi: CommandExecApi;
	cwd: string;
	metadataDbAccess: GraphiteMetadataDbAccess;
}

export async function handleCccSlotDispatchFromTrunk(options: {
	pi: DispatchFromTrunkRuntime;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
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
	notify?: (message: string) => void;
	metadataDbAccess?: GraphiteMetadataDbAccess;
}): Promise<BranchCreateResult | { error: string }> {
	const { pi, cwd, prompt, notify } = options;
	notify?.("Resolving Graphite trunk…");
	const trunk = await resolveGraphiteTrunkBranch({
		pi,
		cwd,
		metadataDbAccess: options.metadataDbAccess ?? createGraphiteMetadataDbAccess(),
	});
	if ("error" in trunk) return trunk;
	const trunkBranch = trunk.branch;

	notify?.("Refreshing Graphite trunk…");
	const refresh = await refreshLocalTrunkBranch({ pi, cwd, trunkBranch });
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
	const { pi, cwd } = context;
	const trunk = await runGraphiteCommand(execApiToCommandRunner(pi), {
		cwd,
		args: ["trunk", "--no-interactive"],
	});
	if (commandSucceeded(trunk)) {
		const trunkBranch = firstNonEmptyLine(trunk.stdout);
		if (trunkBranch === undefined) {
			return { error: "gt trunk --no-interactive returned no branch." };
		}
		return { branch: trunkBranch };
	}
	const trunkFailureMessage = formatCommandFailure(
		"Could not resolve Graphite trunk.",
		"gt trunk --no-interactive",
		trunk,
	);
	if (!isDetachedHeadGraphiteTrunkFailure(trunk)) {
		return { error: trunkFailureMessage };
	}

	const metadataTrunk = await resolveGraphiteTrunkBranchFromMetadata(context);
	if ("branch" in metadataTrunk) return metadataTrunk;
	return { error: [trunkFailureMessage, metadataTrunk.error].join("\n\n") };
}

function isDetachedHeadGraphiteTrunkFailure(result: { stdout: string; stderr: string }): boolean {
	return `${result.stdout}\n${result.stderr}`.toLowerCase().includes("no current branch");
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

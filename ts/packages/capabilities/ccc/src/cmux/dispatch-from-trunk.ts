import {
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	formatCommandFailure,
	piExecApiToCommandExecApi,
} from "@nseng-ai/core/command";
import { firstNonEmptyLine } from "@nseng-ai/core/text-normalization";
import {
	planLocalBranchRefreshFromWorktrees,
	type LocalBranchRefreshPlan,
} from "@nseng-ai/capability-kit/git";
import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
import { optionalEntry } from "@nseng-ai/core/primitives";

import { CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME } from "./command-surfaces.ts";
import {
	buildLaunchPrompt,
	createTrackedBranchFromResolvedParent,
	dispatchTrackedBranchPrompt,
	resolveDispatchPromptPayloadOptions,
	runText,
	type BranchCreateResult,
} from "./dispatch-prompt.ts";
import type { SlotClient } from "@nseng-ai/slot/api";
import type { CommandContext, ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";

const COMMAND_NAME = CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME;
const GIT_TRUNK_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

export async function handleCccSlotDispatchFromTrunk(options: {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
	slotClient?: SlotClient;
	notifyProgress: (message: string) => void;
}): Promise<void> {
	const { pi, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	options.notifyProgress("Resolving Graphite trunk…");
	await ctx.waitForIdle();
	const branch = await createTrackedBranchFromTrunkForPrompt({
		pi,
		cwd: ctx.cwd,
		prompt,
		notify: options.notifyProgress,
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
	pi: Pick<ExtensionAPI, "exec">;
	cwd: string;
	prompt: string;
	notify?: (message: string) => void;
}): Promise<BranchCreateResult | { error: string }> {
	const { pi, cwd, prompt, notify } = options;
	notify?.("Resolving Graphite trunk…");
	const trunk = await runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), {
		cwd,
		args: ["trunk", "--no-interactive"],
	});
	if (!commandSucceeded(trunk)) {
		return {
			error: formatCommandFailure(
				"Could not resolve Graphite trunk.",
				"gt trunk --no-interactive",
				trunk,
			),
		};
	}
	const trunkBranch = firstNonEmptyLine(trunk.stdout);
	if (trunkBranch === undefined) {
		return { error: "gt trunk --no-interactive returned no branch." };
	}

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

async function refreshLocalTrunkBranch(options: {
	pi: Pick<ExtensionAPI, "exec">;
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

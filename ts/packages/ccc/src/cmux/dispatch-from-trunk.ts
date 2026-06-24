import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import {
	execApiToCommandRunner,
	formatCommand,
	formatCommandFailure,
	isSuccessfulExecResult,
	piExecApiToCommandExecApi,
} from "@sdl/core/exec";
import { planLocalBranchRefreshFromWorktrees, type LocalBranchRefreshPlan } from "@sdl/core/git";
import { runGraphiteCommand } from "@sdl/graphite/branch";
import { sendCommandProgressOrNotify } from "@sdl/pi/commands/ack";

import {
	buildBrmemPayloadPiLaunchCommand,
	buildLaunchPrompt,
	createTrackedBranchFromResolvedParent,
	formatDispatchPromptStorageFailure,
	resolveDispatchPromptPayloadOptions,
	runText,
	storeDispatchPromptPayload,
	type BranchCreateResult,
	type DispatchPromptPayloadOptions,
} from "./dispatch-prompt.ts";
import { getPiLaunchOptions } from "./pi-launch.ts";
import { openBranchInCmuxSlot } from "./slot.ts";
import type { SlotCheckoutFunction } from "../slot-checkout.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "ccc:workspace:dispatch-from-trunk";
const GIT_TRUNK_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

export function registerCccSlotDispatchFromTrunkCommand(
	pi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Create a Graphite-tracked branch from refreshed trunk and dispatch a prompt in a new cmux workspace.",
			argumentHint: "<prompt>",
			handler: async (args, ctx) => {
				await handleCccSlotDispatchFromTrunk({
					pi,
					payloadOptions,
					...(options.slotCheckout === undefined ? {} : { slotCheckout: options.slotCheckout }),
					args,
					ctx,
				});
			},
		},
	});
}

async function handleCccSlotDispatchFromTrunk(options: {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
	slotCheckout?: SlotCheckoutFunction;
}): Promise<void> {
	const { pi, payloadOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	sendCommandProgressOrNotify({ host: pi, ctx, message: "Resolving Graphite trunk…" });
	await ctx.waitForIdle();
	const branch = await createTrackedBranchFromTrunkForPrompt({
		pi,
		cwd: ctx.cwd,
		prompt,
		notify: (message) => sendCommandProgressOrNotify({ host: pi, ctx, message }),
	});
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: "Storing dispatch prompt in Branch Memory…",
	});
	const stored = await storeDispatchPromptPayload({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		content: buildLaunchPrompt(prompt, TRUNK_DISPATCH_CONTEXT_NOTE),
		payloadOptions,
	});
	if (!stored.ok) {
		ctx.ui.notify(formatDispatchPromptStorageFailure(branch.branchName, stored.error), "error");
		return;
	}

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildBrmemPayloadPiLaunchCommand(branch.branchName, launchOptions),
		description: `dispatch-from-trunk from ${branch.parentBranch}`,
		...(options.slotCheckout === undefined ? {} : { slotCheckout: options.slotCheckout }),
		notify: (message, level) => ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened cmux workspace: ${target.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
				`Dispatch payload: ${stored.value.namespace}/${stored.value.key}`,
				`Entry Locator: ${stored.value.refName}`,
			].join("\n"),
	});
	if ("error" in launched) {
		return;
	}
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
	if (!isSuccessfulExecResult(trunk)) {
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
	if (!isSuccessfulExecResult(worktrees)) {
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
	if (isSuccessfulExecResult(refresh)) return { ok: true };
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

function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split(/\r?\n/)
		.find((line) => line.trim().length > 0)
		?.trim();
}

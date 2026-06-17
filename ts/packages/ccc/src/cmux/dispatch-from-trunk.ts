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
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "ccc:workspace:dispatch-from-trunk";
const TRUNK_DISPATCH_CONTEXT_NOTE =
	"This branch was created from refreshed Graphite trunk and is intentionally unrelated to the caller's current stack.";

export function registerCccSlotDispatchFromTrunkCommand(
	pi: ExtensionAPI,
	options: DispatchPromptPayloadOptions = {},
): void {
	const payloadOptions = resolveDispatchPromptPayloadOptions(options);
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite-tracked branch from refreshed trunk and dispatch a prompt in a new cmux workspace.",
		argumentHint: "<prompt>",
		handler: async (args, ctx) => {
			await handleCccSlotDispatchFromTrunk({ pi, payloadOptions, args, ctx });
		},
	});
}

async function handleCccSlotDispatchFromTrunk(options: {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	payloadOptions: ReturnType<typeof resolveDispatchPromptPayloadOptions>;
	args: string;
	ctx: CommandContext;
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
		notify: (message) => ctx.ui.notify(message, "info"),
	});
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	ctx.ui.notify("Storing dispatch prompt in Branch Memory…", "info");
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
	const trunk = await runText(pi, cwd, "gt", ["trunk", "--no-interactive"]);
	if (!trunk.ok) {
		return { error: `Could not resolve Graphite trunk: ${trunk.message}` };
	}
	const trunkBranch = firstNonEmptyLine(trunk.text);
	if (trunkBranch === undefined) {
		return { error: "gt trunk --no-interactive returned no branch." };
	}

	notify?.("Refreshing Graphite trunk…");
	const refresh = await runText(pi, cwd, "gt", [
		"get",
		trunkBranch,
		"--no-restack",
		"--no-checkout",
		"--force",
		"--no-interactive",
	]);
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

function firstNonEmptyLine(text: string): string | undefined {
	return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
}

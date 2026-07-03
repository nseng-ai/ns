import type { ExecResult } from "@ji/core/command";
import { z } from "zod";

import { formatCommandOutput, notifyCommandUi } from "@ji/pi/commands/helpers";
import { registerCommandWithImmediateAck, sendCommandProgressOrNotify } from "@ji/pi/commands/ack";
import { definePiSurfaceParity } from "@ji/pi/parity/extension";

import { type FlowCommandContext, type FlowRegisteredCommand } from "./command-support.ts";
import { type FlowGraphiteCommandHost, runFlowGraphiteCommand } from "./graphite-command.ts";

export const STACK_SQUASH_COMMAND_NAME = "gt:squash-stack";

export const stackSquashParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: STACK_SQUASH_COMMAND_NAME,
		workflow: "Squash each branch in the current Graphite stack to one commit from top to bottom",
		parity: "FULL",
		cli: "slot gt exec stack-branches --downstack --format json, then gt checkout + gt squash for each branch from tip to bottom",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ji/flow/pi",
		sourceModule: "stack-squash",
		notes:
			"Pi command is deterministic Graphite automation; non-Pi users can run the same gt command sequence manually.",
	},
] as const);

const GIT_STATUS_TIMEOUT_MS = 60_000;
const SLOT_STACK_BRANCHES_TIMEOUT_MS = 60_000;
const GT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000;

export interface StackSquashExtensionAPI extends FlowGraphiteCommandHost {
	registerCommand(name: string, options: FlowRegisteredCommand): void;
}

interface ProcessedBranch {
	branch: string;
	state: "squashed" | "already_one_commit";
}

interface CommandFailure {
	label: string;
	result: ExecResult;
}

const stackBranchesEnvelopeSchema = z.object({
	status: z.string(),
	exitCode: z.number().optional(),
	message: z.string().optional(),
	data: z
		.object({
			branches: z.array(z.string()),
		})
		.optional(),
});

export default function stackSquashExtension(pi: StackSquashExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: STACK_SQUASH_COMMAND_NAME,
		commandDefinition: {
			description:
				"Run gt squash on every branch in the current stack from the tip down to the bottom",
			handler: async (_args, ctx) => {
				await ctx.waitForIdle?.();
				await runStackSquash(pi, ctx);
			},
		},
	});
}

export async function runStackSquash(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
): Promise<void> {
	const status = await pi.exec("git", ["status", "--porcelain=v1"], {
		cwd: ctx.cwd,
		timeout: GIT_STATUS_TIMEOUT_MS,
	});
	if (status.code !== 0 || status.killed) {
		notifyCommandUi(
			ctx,
			`Cannot inspect worktree state; not starting stack squash.\n\n${formatCommandOutput(status)}`,
			"error",
		);
		return;
	}
	if (status.stdout.trim().length > 0) {
		notifyCommandUi(
			ctx,
			`Worktree has uncommitted changes; not starting stack squash.\n\n${status.stdout.trim()}`,
			"error",
		);
		return;
	}

	const stackBranches = await loadDownstackBranches(pi, ctx);
	if (stackBranches.type === "failure") {
		notifyCommandUi(ctx, stackBranches.message, "error");
		return;
	}
	if (stackBranches.branches.length === 0) {
		notifyCommandUi(ctx, "No Graphite stack branches to squash.", "info");
		return;
	}

	const branchesFromTip = [...stackBranches.branches].reverse();
	const tipBranch = branchesFromTip[0] ?? null;
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Preparing to squash ${branchesFromTip.length} Graphite stack branch${branchesFromTip.length === 1 ? "" : "es"} from ${branchesFromTip[0] ?? "tip"}.`,
	});

	const processed: ProcessedBranch[] = [];
	for (const branch of branchesFromTip) {
		const checkout = await runGt(pi, ctx, ["checkout", branch, "--no-interactive"]);
		if (checkout.code !== 0 || checkout.killed) {
			notifyCommandUi(
				ctx,
				formatFailureMessage({ label: `gt checkout failed for ${branch}`, result: checkout }),
				"error",
			);
			return;
		}

		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message: `Squashing ${branch}.`,
		});
		const squash = await runGt(pi, ctx, ["squash", "--no-edit", "--no-interactive"]);
		if (squash.code !== 0 || squash.killed) {
			if (!squash.killed && isAlreadyOneCommitSquashResult(squash)) {
				processed.push({ branch, state: "already_one_commit" });
			} else {
				notifyCommandUi(
					ctx,
					formatFailureMessage({ label: `gt squash failed on ${branch}`, result: squash }),
					"error",
				);
				return;
			}
		} else {
			processed.push({ branch, state: "squashed" });
		}
	}

	if (tipBranch !== null) {
		const restore = await runGt(pi, ctx, ["checkout", tipBranch, "--no-interactive"]);
		if (restore.code !== 0 || restore.killed) {
			notifyCommandUi(
				ctx,
				formatFailureMessage({
					label: `gt checkout failed restoring tip ${tipBranch}`,
					result: restore,
				}),
				"error",
			);
			return;
		}
	}

	notifyCommandUi(ctx, formatSuccessMessage(processed), "info");
}

async function loadDownstackBranches(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
): Promise<{ type: "ok"; branches: string[] } | { type: "failure"; message: string }> {
	const result = await pi.exec(
		"ji",
		["slot", "gt", "exec", "stack-branches", "--downstack", "--format", "json"],
		{
			cwd: ctx.cwd,
			timeout: SLOT_STACK_BRANCHES_TIMEOUT_MS,
		},
	);
	if (result.code !== 0 || result.killed) {
		return {
			type: "failure",
			message: `Could not read Graphite stack branches; not starting stack squash.\n\n${formatCommandOutput(result)}`,
		};
	}

	const parsedJson = parseJson(result.stdout);
	if (parsedJson.type === "failure") {
		return {
			type: "failure",
			message: `Could not parse ji slot gt exec stack-branches JSON: ${parsedJson.message}`,
		};
	}
	const envelope = stackBranchesEnvelopeSchema.safeParse(parsedJson.value);
	if (!envelope.success) {
		return {
			type: "failure",
			message: `Unexpected ji slot gt exec stack-branches JSON shape: ${envelope.error.message}`,
		};
	}
	if (envelope.data.status !== "ok" || envelope.data.data === undefined) {
		return {
			type: "failure",
			message:
				envelope.data.message ??
				`ji slot gt exec stack-branches failed with status ${envelope.data.status}`,
		};
	}
	return { type: "ok", branches: envelope.data.data.branches };
}

function parseJson(
	raw: string,
): { type: "ok"; value: unknown } | { type: "failure"; message: string } {
	try {
		return { type: "ok", value: JSON.parse(raw) };
	} catch (caught) {
		const message = caught instanceof Error ? caught.message : String(caught);
		return { type: "failure", message };
	}
}

async function runGt(
	pi: StackSquashExtensionAPI,
	ctx: FlowCommandContext,
	args: readonly string[],
): Promise<ExecResult> {
	return await runFlowGraphiteCommand(pi, {
		cwd: ctx.cwd,
		args,
		timeoutMs: GT_COMMAND_TIMEOUT_MS,
	});
}

function isAlreadyOneCommitSquashResult(result: ExecResult): boolean {
	return `${result.stdout}\n${result.stderr}`.includes(
		"Only one commit in branch, nothing to squash.",
	);
}

function formatSuccessMessage(processed: readonly ProcessedBranch[]): string {
	return [
		`Processed ${processed.length} Graphite stack branch${processed.length === 1 ? "" : "es"}; each now has one commit.`,
		"",
		...processed.map((entry) =>
			entry.state === "already_one_commit"
				? `- ${entry.branch} (already one commit)`
				: `- ${entry.branch} (squashed)`,
		),
	].join("\n");
}

function formatFailureMessage(failure: CommandFailure): string {
	return [`${failure.label}; stack squash stopped.`, formatCommandOutput(failure.result)]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

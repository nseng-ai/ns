import { commandSucceeded, formatCommand, tailText } from "@sdl/core/exec";
import { failure, negative, ok } from "@sdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../context.ts";
import { buildSlotInventory, poolSize, type SlotRecord } from "../inventory.ts";

const FOREACH_OUTPUT_MAX_CHARS = 4_000;
const FOREACH_OUTPUT_MAX_LINES = 80;

export const foreachRequestSchema = z.object({
	command: z
		.array(z.string())
		.default([])
		.describe("Command argv to run in each slot, passed after `--`."),
	yes: z.boolean().default(false).describe("Skip the confirmation prompt."),
});

export const foreachSlotResultSchema = z.object({
	slot_name: z.string(),
	worktree_path: z.string(),
	branch: z.string().nullable(),
	exit_code: z.number(),
	stdout: z.string(),
	stderr: z.string(),
	succeeded: z.boolean(),
});

export const foreachResultSchema = z.object({
	command: z.array(z.string()),
	slots: z.array(foreachSlotResultSchema),
	cancelled: z.boolean(),
});

export type ForeachRequest = z.infer<typeof foreachRequestSchema>;
export type ForeachResult = z.infer<typeof foreachResultSchema>;
export type ForeachSlotResult = z.infer<typeof foreachSlotResultSchema>;

export async function runForeach(ctx: SlotCliContext, request: ForeachRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	if (request.command.length === 0)
		return failure(
			"missing_command",
			"Pass a command after --, e.g. `sdl slot foreach -- git clean -fd`.",
		);
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const inProgress = inventory.records.filter((record) => record.operation !== null);
	if (inProgress.length > 0) return failure("operation_in_progress", inProgressMessage(inProgress));
	const records = inventory.records;
	if (!request.yes) {
		if (!ctx.shouldWriteCdDirective)
			return failure("confirmation_required", "sdl slot foreach requires --yes in JSON mode.");
		const confirmed = await repoCtx.interaction.confirm({
			message: `Run \`${formatCommand(request.command[0]!, request.command.slice(1))}\` in ${records.length} slot(s)?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
		if (confirmed.type === "declined")
			return ok({ command: [...request.command], slots: [], cancelled: true });
	}
	const slots: ForeachSlotResult[] = [];
	for (const record of records) {
		const result = await ctx.command.run(request.command[0]!, request.command.slice(1), {
			cwd: record.path,
		});
		slots.push({
			slot_name: record.slotName,
			worktree_path: record.path,
			branch: record.branch,
			exit_code: result.code,
			stdout: tailOutput(result.stdout),
			stderr: tailOutput(result.stderr),
			succeeded: commandSucceeded(result),
		});
	}
	const result: ForeachResult = { command: [...request.command], slots, cancelled: false };
	const failedCount = slots.filter((slot) => !slot.succeeded).length;
	if (failedCount > 0)
		return negative(
			`sdl slot foreach: command failed in ${failedCount} of ${slots.length} slot(s).`,
			result,
		);
	return ok(result);
}

export function renderForeach(result: ForeachResult): string {
	if (result.cancelled) return "Cancelled slot foreach.";
	const lines: string[] = [];
	for (const slot of result.slots) {
		lines.push(`${slot.slot_name} (${slot.branch ?? "—"}) -> exit ${slot.exit_code}`);
		appendIndented(lines, slot.stdout);
		appendIndented(lines, slot.stderr);
	}
	const succeeded = result.slots.filter((slot) => slot.succeeded).length;
	lines.push(`${succeeded}/${result.slots.length} slots succeeded`);
	return lines.join("\n");
}

function inProgressMessage(records: readonly SlotRecord[]): string {
	const lines = records.map((record) => `  ${record.slotName}: ${record.operation} in progress`);
	return [
		"Cannot run foreach: a git operation is in progress in:",
		...lines,
		"Resolve these operations first.",
	].join("\n");
}

function tailOutput(text: string): string {
	if (text.length === 0) return "";
	return tailText(text, {
		maxChars: FOREACH_OUTPUT_MAX_CHARS,
		maxLines: FOREACH_OUTPUT_MAX_LINES,
	});
}

function appendIndented(lines: string[], text: string): void {
	const trimmed = text.replace(/\s+$/, "");
	if (trimmed.length === 0) return;
	for (const line of trimmed.split("\n")) lines.push(`    ${line}`);
}

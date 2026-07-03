import { commandSucceeded, formatCommand, tailText } from "@sdl/core/command";
import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { cell, paint, renderTable } from "@sdl/core/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../core/context.ts";
import { buildSlotInventory, poolSize, type SlotRecord } from "../../core/inventory.ts";

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
	slotName: z.string(),
	worktreePath: z.string(),
	branch: z.string().nullable(),
	exitCode: z.number(),
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
			"missing-command",
			"Pass a command after --, e.g. `ji slot foreach -- git clean -fd`.",
		);
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	const inProgress = inventory.records.filter((record) => record.operation !== null);
	if (inProgress.length > 0) return failure("operation-in-progress", inProgressMessage(inProgress));
	const records = inventory.records;
	if (!request.yes) {
		if (!ctx.shouldWriteCdDirective)
			return failure("confirmation-required", "ji slot foreach requires --yes in JSON mode.");
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
			slotName: record.slotName,
			worktreePath: record.path,
			branch: record.branch,
			exitCode: result.code,
			stdout: tailOutput(result.stdout),
			stderr: tailOutput(result.stderr),
			succeeded: commandSucceeded(result),
		});
	}
	const result: ForeachResult = { command: [...request.command], slots, cancelled: false };
	const failedCount = slots.filter((slot) => !slot.succeeded).length;
	if (failedCount > 0)
		return negative(
			`ji slot foreach: command failed in ${failedCount} of ${slots.length} slot(s).`,
			{ data: result },
		);
	return ok(result);
}

export function renderForeach(
	result: ForeachResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.cancelled) return "Cancelled slot foreach.";
	const renderCaps = resolveRenderCapabilities(caps);
	const succeeded = result.slots.filter((slot) => slot.succeeded).length;
	const failed = result.slots.length - succeeded;
	return [
		`Slot foreach: ${formatCommand(result.command[0] ?? "", result.command.slice(1))}`,
		`${succeeded}/${result.slots.length} slots succeeded${failed === 0 ? "" : `; ${failed} failed`}`,
		"",
		...renderTable({
			caps: renderCaps,
			columns: [
				{ header: "SLOT", width: "auto" },
				{ header: "BRANCH", width: "auto" },
				{ header: "EXIT", width: "auto", align: "right" },
				{ header: "RESULT", width: "auto" },
			],
			rows: result.slots.map((slot) => [
				cell(paint(renderCaps, "accent", slot.slotName), slot.slotName),
				cell(slot.branch ?? "—"),
				cell(String(slot.exitCode)),
				statusCell(renderCaps, slot.succeeded),
			]),
		}),
		...result.slots.flatMap(slotOutputLines),
	].join("\n");
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

function statusCell(caps: ReturnType<typeof resolveRenderCapabilities>, succeeded: boolean) {
	const text = succeeded ? "ok" : "failed";
	return cell(paint(caps, succeeded ? "success" : "error", text), text);
}

function slotOutputLines(slot: ForeachSlotResult): string[] {
	if (slot.stdout.length === 0 && slot.stderr.length === 0) return [];
	return [
		"",
		`${slot.slotName} output:`,
		...indentedOutputLines(slot.stdout, "stdout"),
		...indentedOutputLines(slot.stderr, "stderr"),
	];
}

function indentedOutputLines(text: string, stream: "stdout" | "stderr"): string[] {
	const trimmed = text.replace(/\s+$/, "");
	if (trimmed.length === 0) return [];
	return [`  ${stream}:`, ...trimmed.split("\n").map((line) => `    ${line}`)];
}

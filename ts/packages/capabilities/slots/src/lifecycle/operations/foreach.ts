import {
	commandSucceeded,
	formatCommand,
	tailText,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { cell, paint, renderTable } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../core/context.ts";
import { buildSlotInventory, poolSize, type SlotRecord } from "../../core/inventory.ts";
import type { WorktreeInfo } from "../../core/gateways/repository.ts";

const FOREACH_OUTPUT_MAX_CHARS = 4_000;
const FOREACH_OUTPUT_MAX_LINES = 80;

export const foreachRequestSchema = z.object({
	command: z
		.array(z.string())
		.default([])
		.describe(
			"Command argv to run in the main worktree and each included slot, passed after `--`.",
		),
	exclude: z
		.array(z.string())
		.default([])
		.describe("Managed Slot worktree name to exclude. May be repeated."),
	yes: z.boolean().default(false).describe("Skip the confirmation prompt."),
});

const foreachWorktreeResultSchema = z.object({
	worktreePath: z.string(),
	branch: z.string().nullable(),
	termination: z.enum(["exited", "spawn-failed", "cancelled", "timed-out"]),
	exitCode: z.number().nullable(),
	signal: z.string().nullable(),
	error: z.string().nullable(),
	stdout: z.string(),
	stderr: z.string(),
	succeeded: z.boolean(),
});

export const foreachSlotResultSchema = foreachWorktreeResultSchema.extend({
	slotName: z.string(),
});

export const foreachResultSchema = z.object({
	command: z.array(z.string()),
	excluded: z.array(z.string()),
	mainWorktree: foreachWorktreeResultSchema.nullable(),
	slots: z.array(foreachSlotResultSchema),
	cancelled: z.boolean(),
});

export type ForeachRequest = z.infer<typeof foreachRequestSchema>;
export type ForeachResult = z.infer<typeof foreachResultSchema>;
export type ForeachWorktreeResult = z.infer<typeof foreachWorktreeResultSchema>;
export type ForeachSlotResult = z.infer<typeof foreachSlotResultSchema>;

interface ForeachTarget {
	label: string;
	path: string;
	branch: string | null;
}

interface InProgressTarget {
	label: string;
	operation: string;
}

interface ForeachProgressReporter {
	started: (target: ForeachTarget, index: number, total: number) => void;
	finished: (target: ForeachTarget, index: number, total: number, result: ExecResult) => void;
}

export async function runForeach(ctx: SlotCliContext, request: ForeachRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const [command, ...commandArgs] = request.command;
	if (command === undefined)
		return failure(
			"missing-command",
			"Pass a command after --, e.g. `ns slot foreach -- git clean -fd`.",
		);
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	const slotNames = new Set(inventory.records.map((record) => record.slotName));
	const unknownExclusions = request.exclude.filter((slotName) => !slotNames.has(slotName));
	if (unknownExclusions.length > 0)
		return failure(
			"unknown-slot",
			`Cannot exclude unknown managed slot(s): ${unknownExclusions.join(", ")}.`,
		);
	if (inventory.mainWorktree === null)
		return failure(
			"main-worktree-not-found",
			`Cannot find the main worktree at ${repoCtx.repo.mainRepoRoot}.`,
		);
	const excluded = new Set(request.exclude);
	const records = inventory.records.filter((record) => !excluded.has(record.slotName));
	const mainOccupancy = inventory.branchOccupancies.find(
		(occupancy) => occupancy.path === repoCtx.repo.mainRepoRoot,
	);
	const mainOperation =
		mainOccupancy !== undefined && mainOccupancy.operation !== "checked-out" ? mainOccupancy : null;
	const inProgress: InProgressTarget[] = [
		...(mainOperation === null
			? []
			: [{ label: "main worktree", operation: mainOperation.operation }]),
		...records.flatMap((record) =>
			record.operation === null ? [] : [{ label: record.slotName, operation: record.operation }],
		),
	];
	if (inProgress.length > 0) return failure("operation-in-progress", inProgressMessage(inProgress));
	if (!request.yes) {
		if (!ctx.shouldWriteCdDirective)
			return failure("confirmation-required", "ns slot foreach requires --yes in JSON mode.");
		const confirmed = await repoCtx.interaction.confirm({
			message: `Run \`${formatCommand(command, commandArgs)}\` in the main worktree and ${records.length} ${records.length === 1 ? "slot" : "slots"}?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
		if (confirmed.type === "declined")
			return ok({
				command: [...request.command],
				excluded: [...request.exclude],
				mainWorktree: null,
				slots: [],
				cancelled: true,
			});
	}
	const mainTarget = buildMainTarget(repoCtx.repo.mainRepoRoot, inventory.mainWorktree);
	const totalTargets = records.length + 1;
	const progress = createProgressReporter(repoCtx);
	progress?.started(mainTarget, 1, totalTargets);
	const mainExecution = await ctx.command.run(command, commandArgs, { cwd: mainTarget.path });
	progress?.finished(mainTarget, 1, totalTargets, mainExecution);
	const mainWorktree = buildWorktreeResult(mainTarget, mainExecution);
	const slots: ForeachSlotResult[] = [];
	for (const [index, record] of records.entries()) {
		const target = buildSlotTarget(record);
		const ordinal = index + 2;
		progress?.started(target, ordinal, totalTargets);
		const execution = await ctx.command.run(command, commandArgs, { cwd: target.path });
		progress?.finished(target, ordinal, totalTargets, execution);
		slots.push({ ...buildWorktreeResult(target, execution), slotName: record.slotName });
	}
	const result: ForeachResult = {
		command: [...request.command],
		excluded: [...request.exclude],
		mainWorktree,
		slots,
		cancelled: false,
	};
	const failedCount = [mainWorktree, ...slots].filter((target) => !target.succeeded).length;
	if (failedCount > 0)
		return negative(
			`ns slot foreach: command failed in ${failedCount} of ${totalTargets} worktree(s).`,
			{ data: result, human: renderForeach(result, ctx.renderCapabilities) },
		);
	return ok(result);
}

export function renderForeach(
	result: ForeachResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.cancelled) return "Cancelled slot foreach.";
	const renderCaps = resolveRenderCapabilities(caps);
	const mainWorktree = result.mainWorktree;
	if (mainWorktree === null) return "Slot foreach completed without a main worktree result.";
	const targets = [
		{ label: "main worktree", result: mainWorktree },
		...result.slots.map((slot) => ({ label: slot.slotName, result: slot })),
	];
	const succeeded = targets.filter((target) => target.result.succeeded).length;
	const failed = targets.length - succeeded;
	return [
		`Slot foreach: ${formatCommand(result.command[0] ?? "", result.command.slice(1))}`,
		`${succeeded}/${targets.length} worktrees succeeded${failed === 0 ? "" : `; ${failed} failed`}`,
		...(result.excluded.length === 0 ? [] : [`Excluded Slots: ${result.excluded.join(", ")}`]),
		"",
		...renderTable({
			caps: renderCaps,
			columns: [
				{ header: "TARGET", width: "auto" },
				{ header: "BRANCH", width: "auto" },
				{ header: "EXIT", width: "auto", align: "right" },
				{ header: "RESULT", width: "auto" },
			],
			rows: targets.map((target) => [
				cell(paint(renderCaps, "accent", target.label), target.label),
				cell(target.result.branch ?? "—"),
				cell(target.result.exitCode === null ? "—" : String(target.result.exitCode)),
				statusCell(renderCaps, target.result.succeeded),
			]),
		}),
		...worktreeOutputLines("main worktree", mainWorktree),
		...result.slots.flatMap((slot) => worktreeOutputLines(slot.slotName, slot)),
	].join("\n");
}

function buildMainTarget(mainRepoRoot: string, mainWorktree: WorktreeInfo): ForeachTarget {
	return {
		label: "main worktree",
		path: mainRepoRoot,
		branch: mainWorktree.branch,
	};
}

function buildSlotTarget(record: SlotRecord): ForeachTarget {
	return {
		label: record.slotName,
		path: record.path,
		branch: record.branch,
	};
}

function buildWorktreeResult(target: ForeachTarget, result: ExecResult): ForeachWorktreeResult {
	return {
		worktreePath: target.path,
		branch: target.branch,
		termination: result.type,
		exitCode: result.type === "spawn-failed" ? null : result.code,
		signal: result.type === "spawn-failed" ? null : result.signal,
		error: result.type === "spawn-failed" ? result.error : null,
		stdout: tailOutput(result.stdout),
		stderr: tailOutput(result.stderr),
		succeeded: commandSucceeded(result),
	};
}

function inProgressMessage(targets: readonly InProgressTarget[]): string {
	const lines = targets.map((target) => `  ${target.label}: ${target.operation} in progress`);
	return [
		"Cannot run foreach: a git operation is in progress in:",
		...lines,
		"Resolve these operations first.",
	].join("\n");
}

function createProgressReporter(ctx: RepoSlotContext): ForeachProgressReporter | null {
	if (!ctx.shouldWriteCdDirective) return null;
	return {
		started: (target, index, total) => {
			ctx.stderr(
				`Running in ${target.label} (${target.branch ?? "detached"}) [${index}/${total}]…\n`,
			);
		},
		finished: (target, index, total, result) => {
			const outcome = commandSucceeded(result) ? "succeeded" : "failed";
			ctx.stderr(
				`Finished ${target.label} (${target.branch ?? "detached"}) [${index}/${total}]: ${outcome} (${progressTermination(result)}).\n`,
			);
		},
	};
}

function progressTermination(result: ExecResult): string {
	switch (result.type) {
		case "exited":
			return `exit ${result.code ?? "unknown"}${result.signal === null ? "" : `; signal ${result.signal}`}`;
		case "spawn-failed":
			return "spawn failed";
		case "cancelled":
			return terminationDetail("cancelled", result.code, result.signal);
		case "timed-out":
			return terminationDetail("timed out", result.code, result.signal);
	}
}

function terminationDetail(label: string, code: number | null, signal: string | null): string {
	if (signal !== null) return `${label}; signal ${signal}`;
	if (code !== null) return `${label}; exit ${code}`;
	return label;
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

function worktreeOutputLines(label: string, result: ForeachWorktreeResult): string[] {
	if (result.stdout.length === 0 && result.stderr.length === 0) return [];
	return [
		"",
		`${label} output:`,
		...indentedOutputLines(result.stdout, "stdout"),
		...indentedOutputLines(result.stderr, "stderr"),
	];
}

function indentedOutputLines(text: string, stream: "stdout" | "stderr"): string[] {
	const trimmed = text.replace(/\s+$/, "");
	if (trimmed.length === 0) return [];
	return [`  ${stream}:`, ...trimmed.split("\n").map((line) => `    ${line}`)];
}

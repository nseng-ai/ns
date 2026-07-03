import { failure, ok, type ClinkrExit, type RenderCapabilities } from "@ji/clinkr";
import { z } from "zod";

import type { GitGateway } from "@ji/capability-kit/git";
import { renderTextTable, type TextTableColumn } from "@ji/core/text-table";

import type { ObjectiveCliContext } from "../context.ts";
import {
	activeRecordRelativePath,
	activeRootRelativePath,
	type ObjectiveRecordStatus,
	type ObjectiveStorage,
} from "../storage.ts";

import { removeOneTrailingNewline } from "./format.ts";
import {
	buildObjectiveBranchAttribution,
	MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS,
} from "./list-branch-attribution.ts";

export const objectiveStatusFilterSchema = z.enum(["all", "active", "open", "closed"]);

export const listObjectivesRequestSchema = z.object({
	names: z.boolean().default(false).describe("Output Objective slugs only, one per line."),
	status: objectiveStatusFilterSchema
		.default("active")
		.describe("Filter Objective records by checkout-local status."),
	minimal: z
		.boolean()
		.default(false)
		.describe("Hide local branch attribution and show the compact Objective list."),
});

export const objectiveListRecordSchema = z.object({
	slug: z.string(),
	status: z.enum(["open", "closed"]),
	/**
	 * Present (true) only when Record Frontmatter carries a `blocked:` sentence. Blocked is a
	 * sub-state of open, never a third lifecycle status; `status` stays "open" for blocked records.
	 */
	isBlocked: z.boolean().optional(),
	latestUpdateIso: z.string().nullable(),
	/** Present only when Record Frontmatter declares at least one Objective Edge. */
	edgeCount: z.number().int().positive().optional(),
	updatedBranches: z.array(z.string()).optional(),
	hasOutstandingChanges: z.boolean(),
});

export const objectiveListResultSchema = z.object({
	trunkBranch: z.string(),
	rootPath: z.string(),
	statusFilter: objectiveStatusFilterSchema,
	namesOnly: z.boolean(),
	updatedBranchesIncluded: z.boolean().optional(),
	updatedBranchesTruncated: z.boolean().optional(),
	records: z.array(objectiveListRecordSchema),
});

export type ObjectiveStatusFilter = z.infer<typeof objectiveStatusFilterSchema>;
export type ListObjectivesRequest = z.infer<typeof listObjectivesRequestSchema>;
export type ObjectiveListRecord = z.infer<typeof objectiveListRecordSchema>;
export type ObjectiveListResult = z.infer<typeof objectiveListResultSchema>;

export async function runListObjectives(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<ClinkrExit<ObjectiveListResult>> {
	const result = await buildObjectiveListResult(ctx, request);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	if (result.type === "git-error") return failure(result.error.code, result.error.message);
	return ok(result.value);
}

export async function buildObjectiveListResult(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<
	| { type: "ok"; value: ObjectiveListResult }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return { type: "storage-error", error: inventory.error };

	const filtered = inventory.value.records.filter((record) =>
		matchesStatusFilter(record.status, request.status),
	);
	const includeBranchAttribution = shouldIncludeBranchAttribution(request);
	let updatedBranchesBySlug: ReadonlyMap<string, readonly string[]> = new Map();
	let isUpdatedBranchesTruncated = false;
	if (includeBranchAttribution) {
		const attribution = await buildObjectiveBranchAttribution(ctx.git, {
			repoRoot: ctx.repoRoot,
			trunkBranch: ctx.trunkBranch,
			slugs: new Set(filtered.map((record) => record.slug)),
		});
		if (attribution.type === "git-error") return attribution;
		updatedBranchesBySlug = attribution.value.updatedBranchesBySlug;
		isUpdatedBranchesTruncated = attribution.value.isTruncated;
	}

	const builtRecords = await Promise.all(
		filtered.map((record) =>
			buildObjectiveListRecord({
				storage: ctx.storage,
				git: ctx.git,
				repoRoot: ctx.repoRoot,
				slug: record.slug,
				status: record.status,
				updatedBranches: updatedBranchesBySlug.get(record.slug),
			}),
		),
	);
	const records: ObjectiveListRecord[] = [];
	for (const built of builtRecords) {
		if (built.type === "storage-error") return built;
		if (built.type === "git-error") return built;
		records.push(built.value);
	}

	return {
		type: "ok",
		value: {
			trunkBranch: ctx.trunkBranch,
			rootPath: activeRootRelativePath(),
			statusFilter: request.status,
			namesOnly: request.names,
			...(includeBranchAttribution ? { updatedBranchesIncluded: true } : {}),
			...(isUpdatedBranchesTruncated ? { updatedBranchesTruncated: true } : {}),
			records,
		},
	};
}

export function renderObjectiveListHuman(
	result: ObjectiveListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.namesOnly) return renderSlugs(result.records);

	const parts = [
		"Objective records in this checkout\n",
		`Root: ${result.rootPath}\n`,
		`Status filter: ${result.statusFilter}\n`,
		"\n",
	];
	if (result.records.length === 0) {
		parts.push(`${emptyMessage(result.statusFilter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	const includeUpdatedBranches = result.updatedBranchesIncluded === true;
	parts.push(
		`${renderTextTable({
			columns: humanTableColumns(includeUpdatedBranches),
			rows: result.records.map((record) => humanRecordCells(record, includeUpdatedBranches)),
			canEmitAnsi: caps.canEmitAnsi,
			shouldDrawRule: true,
			headerStyle: "bold-cyan",
		})}\n`,
	);
	if (result.updatedBranchesTruncated === true) {
		parts.push(
			`Updated branch attribution limited to newest ${MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS} changed local branches.\n`,
		);
	}
	return removeOneTrailingNewline(parts.join(""));
}

export function renderObjectiveListMarkdown(result: ObjectiveListResult): string {
	if (result.namesOnly) return renderSlugs(result.records);

	const parts = [
		"# Objective records in this checkout\n",
		"\n",
		`Root: \`${result.rootPath}\`\n`,
		`Status filter: \`${result.statusFilter}\`\n`,
	];
	if (result.records.length === 0) {
		parts.push("\n", `${emptyMessage(result.statusFilter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	parts.push("\n", markdownTableHeader(result), markdownTableSeparator(result));
	for (const record of result.records) {
		parts.push(markdownRecordRow(record, result.updatedBranchesIncluded === true));
	}
	if (result.updatedBranchesTruncated === true) {
		parts.push(
			"\n",
			`_Updated branch attribution limited to newest ${MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS} changed local branches; older updated branches may be omitted._\n`,
		);
	}
	return removeOneTrailingNewline(parts.join(""));
}

export function matchesStatusFilter(
	status: ObjectiveRecordStatus,
	statusFilter: ObjectiveStatusFilter,
): boolean {
	if (statusFilter === "all") return true;
	if (statusFilter === "active") return status === "open";
	return status === statusFilter;
}

export function latestUpdateIsoFromUpdateNames(updateNames: readonly string[]): string | null {
	const candidates = updateNames
		.map((name) => ({ name, iso: updateNameIso(name) }))
		.filter((candidate): candidate is { name: string; iso: string } => candidate.iso !== null)
		.map((candidate) => ({ ...candidate, time: Date.parse(candidate.iso) }))
		.filter((candidate) => Number.isFinite(candidate.time));
	if (candidates.length === 0) return null;
	candidates.sort((left, right) => {
		const byTime = left.time - right.time;
		if (byTime !== 0) return byTime;
		return left.name.localeCompare(right.name);
	});
	return candidates[candidates.length - 1]?.iso ?? null;
}

interface BuildObjectiveListRecordOptions {
	storage: ObjectiveStorage;
	git: GitGateway;
	repoRoot: string;
	slug: string;
	status: ObjectiveRecordStatus;
	updatedBranches: readonly string[] | undefined;
}

async function buildObjectiveListRecord(
	options: BuildObjectiveListRecordOptions,
): Promise<
	| { type: "ok"; value: ObjectiveListRecord }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const relativePath = activeRecordRelativePath(options.slug);
	const updates = await options.storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };
	const dirty = await options.git.hasUncommittedChangesUnder({
		cwd: options.repoRoot,
		relativePath,
	});
	if (!dirty.ok) return { type: "git-error", error: dirty.error };
	const facts = await readListFrontmatterFacts(options.storage, relativePath);
	return {
		type: "ok",
		value: {
			slug: options.slug,
			status: options.status,
			...(facts.isBlocked ? { isBlocked: true } : {}),
			latestUpdateIso: latestUpdateIsoFromUpdateNames(updates.value.map((update) => update.name)),
			...(facts.edgeCount > 0 ? { edgeCount: facts.edgeCount } : {}),
			...(options.updatedBranches === undefined
				? {}
				: { updatedBranches: [...options.updatedBranches] }),
			hasOutstandingChanges: dirty.value,
		},
	};
}

interface ObjectiveListFrontmatterFacts {
	edgeCount: number;
	isBlocked: boolean;
}

/**
 * Record Frontmatter facts for the list surface, via the shared reader (ADR 0025); the body is
 * never interpreted. Safe minimal rendering: a record whose `objective.md` is missing,
 * unreadable, or carries malformed frontmatter lists exactly like one with no frontmatter
 * (blank EDGES cell, no blocked indicator) — reporting malformed frontmatter is the
 * `sdl objective check` linter's job, and the list must not error or mis-render over it.
 */
async function readListFrontmatterFacts(
	storage: ObjectiveStorage,
	recordRelativePath: string,
): Promise<ObjectiveListFrontmatterFacts> {
	const read = await storage.readObjectiveRecordDocument(recordRelativePath);
	if (read.type !== "ok") return { edgeCount: 0, isBlocked: false };
	const parse = read.document.frontmatter;
	if (parse === undefined || parse.type === "malformed") return { edgeCount: 0, isBlocked: false };
	return {
		edgeCount: parse.frontmatter.edges.length,
		isBlocked: parse.frontmatter.blocked !== null,
	};
}

function updateNameIso(name: string): string | null {
	// Objective update filenames in this repo are timestamp-prefixed. This parser intentionally
	// accepts the live timestamp forms and leaves non-timestamp Markdown names without latest-update facts.
	const compact = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-|\.md$)/u.exec(name);
	if (compact !== null) return `${compact[1]}T${compact[2]}:${compact[3]}:${compact[4]}Z`;
	const minute = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(?:-|\.md$)/u.exec(name);
	if (minute !== null) return `${minute[1]}T${minute[2]}:${minute[3]}:00Z`;
	const extended = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})Z(?:-|\.md$)/u.exec(name);
	if (extended !== null) return `${extended[1]}T${extended[2]}:${extended[3]}:${extended[4]}Z`;
	return null;
}

function shouldIncludeBranchAttribution(request: ListObjectivesRequest): boolean {
	return !request.names && !request.minimal;
}

export function renderSlugs(records: readonly ObjectiveListRecord[]): string {
	return records.map((record) => record.slug).join("\n");
}

// Blocked renders as a sub-state of open — the word "open" stays, the glyph and the
// "(blocked)" qualifier mark the sub-state — never as a third lifecycle status.
function statusLabel(record: ObjectiveListRecord): string {
	if (record.status === "closed") return "✓ closed";
	if (record.isBlocked === true) return "⊘ open (blocked)";
	return "○ open";
}

function edgeCountCell(record: ObjectiveListRecord): string {
	if (record.edgeCount === undefined) return "";
	return String(record.edgeCount);
}

export function emptyMessage(statusFilter: ObjectiveStatusFilter): string {
	if (statusFilter === "active" || statusFilter === "open")
		return "No open Objective records found.";
	if (statusFilter === "closed") return "No closed Objective records found.";
	return "No Objective records found.";
}

function formatLatestUpdate(record: ObjectiveListRecord): string {
	const formatted = record.latestUpdateIso ?? "—";
	if (record.hasOutstandingChanges) return `(x) ${formatted}`;
	return formatted;
}

function humanTableColumns(shouldIncludeUpdatedBranches: boolean): TextTableColumn[] {
	const columns: TextTableColumn[] = [
		{ header: "OBJECTIVE", style: "bold-cyan" },
		{ header: "STATUS" },
		{ header: "LATEST UPDATE", style: "dim" },
		{ header: "EDGES" },
	];
	if (shouldIncludeUpdatedBranches) columns.push({ header: "UPDATED BRANCHES" });
	return columns;
}

function humanRecordCells(
	record: ObjectiveListRecord,
	shouldIncludeUpdatedBranches: boolean,
): string[] {
	const cells = [
		record.slug,
		statusLabel(record),
		formatLatestUpdate(record),
		edgeCountCell(record),
	];
	if (shouldIncludeUpdatedBranches) cells.push(humanUpdatedBranchesCell(record));
	return cells;
}

function humanUpdatedBranchesCell(record: ObjectiveListRecord): string {
	const branches = record.updatedBranches ?? [];
	if (branches.length === 0) return "—";
	return branches
		.map((branch, index) => formatBranchLine(index + 1, branches.length, branch))
		.join("\n");
}

function markdownTableHeader(result: ObjectiveListResult): string {
	if (result.updatedBranchesIncluded === true)
		return "| objective | status | latest update | edges | updated branches |\n";
	return "| objective | status | latest update | edges |\n";
}

function markdownTableSeparator(result: ObjectiveListResult): string {
	if (result.updatedBranchesIncluded === true) return "| --- | --- | --- | --- | --- |\n";
	return "| --- | --- | --- | --- |\n";
}

function markdownRecordRow(
	record: ObjectiveListRecord,
	shouldIncludeUpdatedBranches: boolean,
): string {
	const cells = [
		record.slug,
		statusLabel(record),
		formatLatestUpdate(record),
		edgeCountCell(record),
	];
	if (shouldIncludeUpdatedBranches) cells.push(formatUpdatedBranches(record));
	return `| ${cells.join(" | ")} |\n`;
}

function formatUpdatedBranches(record: ObjectiveListRecord): string {
	const branches = record.updatedBranches ?? [];
	if (branches.length === 0) return "—";
	return branches.join(", ");
}

function formatBranchLine(index: number, branchCount: number, branch: string): string {
	const marker = index === branchCount ? "└" : "├";
	if (branchCount === 1) return `${marker} ${branch}`;
	return `${marker} ${index}/${branchCount} ${branch}`;
}

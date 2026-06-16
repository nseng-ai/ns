import { exitCodeForExit, failure, negative, ok, toMachineEnvelope, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { activeRecordRelativePath, activeRootRelativePath, type ObjectiveRecordStatus, type ObjectiveStorage } from "../storage.ts";

import { buildObjectiveBranchAttribution, MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS } from "./list-branch-attribution.ts";

export const objectiveStatusFilterSchema = z.enum(["all", "active", "open", "closed"]);

export const listObjectivesRequestSchema = z.object({
	names: z.boolean().default(false).describe("Output Objective slugs only, one per line."),
	status: objectiveStatusFilterSchema.default("active").describe("Filter Objective records by checkout-local status."),
	minimal: z.boolean().default(false).describe("Hide local branch attribution and show the compact Objective list."),
});

export const objectiveListRecordSchema = z.object({
	slug: z.string(),
	status: z.enum(["open", "closed"]),
	latest_update_iso: z.string().nullable(),
	updated_branches: z.array(z.string()).optional(),
});

export const objectiveListResultSchema = z.object({
	trunk_branch: z.string(),
	root_path: z.string(),
	status_filter: objectiveStatusFilterSchema,
	names_only: z.boolean(),
	updated_branches_included: z.boolean().optional(),
	updated_branches_truncated: z.boolean().optional(),
	records: z.array(objectiveListRecordSchema),
});

export type ObjectiveStatusFilter = z.infer<typeof objectiveStatusFilterSchema>;
export type ListObjectivesRequest = z.infer<typeof listObjectivesRequestSchema>;
export type ObjectiveListRecord = z.infer<typeof objectiveListRecordSchema>;
export type ObjectiveListResult = z.infer<typeof objectiveListResultSchema>;

export type ObjectiveListRenderRecord = ObjectiveListRecord & {
	has_outstanding_changes: boolean;
};

export type ObjectiveListRenderResult = Omit<ObjectiveListResult, "records"> & {
	records: readonly ObjectiveListRenderRecord[];
};

export async function runListObjectives(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<ClinkrExit<ObjectiveListRenderResult>> {
	const result = await buildObjectiveListResult(ctx, request);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	if (result.type === "git-error") return failure(result.error.code, result.error.message);
	return ok(result.value);
}

export async function buildObjectiveListResult(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<
	| { type: "ok"; value: ObjectiveListRenderResult }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return { type: "storage-error", error: inventory.error };

	const filtered = inventory.value.records.filter((record) => matchesStatusFilter(record.status, request.status));
	const includeBranchAttribution = shouldIncludeBranchAttribution(request);
	let updatedBranchesBySlug: ReadonlyMap<string, readonly string[]> = new Map();
	let isUpdatedBranchesTruncated = false;
	if (includeBranchAttribution) {
		const attribution = await buildObjectiveBranchAttribution(ctx.gitFacts, {
			repoRoot: ctx.repoRoot,
			trunkBranch: ctx.trunkBranch,
			slugs: new Set(filtered.map((record) => record.slug)),
		});
		if (attribution.type === "git-error") return attribution;
		updatedBranchesBySlug = attribution.value.updatedBranchesBySlug;
		isUpdatedBranchesTruncated = attribution.value.truncated;
	}

	const records: ObjectiveListRenderRecord[] = [];
	for (const record of filtered) {
		const built = await buildObjectiveListRecord(ctx.storage, ctx.gitFacts, ctx.repoRoot, record.slug, record.status, updatedBranchesBySlug.get(record.slug));
		if (built.type === "storage-error") return built;
		if (built.type === "git-error") return built;
		records.push(built.value);
	}

	return {
		type: "ok",
		value: {
			trunk_branch: ctx.trunkBranch,
			root_path: activeRootRelativePath(),
			status_filter: request.status,
			names_only: request.names,
			...(includeBranchAttribution ? { updated_branches_included: true } : {}),
			...(isUpdatedBranchesTruncated ? { updated_branches_truncated: true } : {}),
			records,
		},
	};
}

export function renderObjectiveListHuman(result: ObjectiveListRenderResult): string {
	if (result.names_only) return renderSlugs(result.records);

	const parts = [
		"Objective records in this checkout\n",
		`Root: ${result.root_path}\n`,
		`Status filter: ${result.status_filter}\n`,
		"\n",
	];
	if (result.records.length === 0) {
		parts.push(`${emptyMessage(result.status_filter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	parts.push(humanTableHeader(result));
	for (const record of result.records) {
		parts.push(...humanRecordRows(record, result.updated_branches_included === true));
	}
	if (result.updated_branches_truncated === true) {
		parts.push(`Updated branch attribution limited to newest ${MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS} changed local branches.\n`);
	}
	return removeOneTrailingNewline(parts.join(""));
}

export function renderObjectiveListMarkdown(result: ObjectiveListRenderResult): string {
	if (result.names_only) return renderSlugs(result.records);

	const parts = [
		"# Objective records in this checkout\n",
		"\n",
		`Root: \`${result.root_path}\`\n`,
		`Status filter: \`${result.status_filter}\`\n`,
	];
	if (result.records.length === 0) {
		parts.push("\n", `${emptyMessage(result.status_filter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	parts.push("\n", markdownTableHeader(result), markdownTableSeparator(result));
	for (const record of result.records) {
		parts.push(markdownRecordRow(record, result.updated_branches_included === true));
	}
	if (result.updated_branches_truncated === true) {
		parts.push(
			"\n",
			`_Updated branch attribution limited to newest ${MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS} changed local branches; older updated branches may be omitted._\n`,
		);
	}
	return removeOneTrailingNewline(parts.join(""));
}

export function legacyObjectiveListMachine(exit: ClinkrExit<ObjectiveListRenderResult>): LegacyMachineOutput {
	const stripped = stripRenderFields(exit);
	return { body: toMachineEnvelope(stripped), exitCode: exitCodeForExit(stripped) };
}

export function matchesStatusFilter(status: ObjectiveRecordStatus, statusFilter: ObjectiveStatusFilter): boolean {
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

async function buildObjectiveListRecord(
	storage: ObjectiveStorage,
	gitFacts: ObjectiveCliContext["gitFacts"],
	repoRoot: string,
	slug: string,
	status: ObjectiveRecordStatus,
	updatedBranches: readonly string[] | undefined,
): Promise<
	| { type: "ok"; value: ObjectiveListRenderRecord }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const relativePath = activeRecordRelativePath(slug);
	const updates = await storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };
	const dirty = await gitFacts.hasUncommittedChangesUnder({ repoRoot, relativePath });
	if (!dirty.ok) return { type: "git-error", error: dirty.error };
	return {
		type: "ok",
		value: {
			slug,
			status,
			latest_update_iso: latestUpdateIsoFromUpdateNames(updates.value.map((update) => update.name)),
			...(updatedBranches === undefined ? {} : { updated_branches: [...updatedBranches] }),
			has_outstanding_changes: dirty.value,
		},
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

function renderSlugs(records: readonly ObjectiveListRecord[]): string {
	return records.map((record) => record.slug).join("\n");
}

function statusLabel(status: ObjectiveRecordStatus): string {
	if (status === "closed") return "✓ closed";
	return "○ open";
}

function emptyMessage(statusFilter: ObjectiveStatusFilter): string {
	if (statusFilter === "active" || statusFilter === "open") return "No open Objective records found.";
	if (statusFilter === "closed") return "No closed Objective records found.";
	return "No Objective records found.";
}

function formatLatestUpdate(record: ObjectiveListRenderRecord): string {
	const formatted = record.latest_update_iso ?? "—";
	if (record.has_outstanding_changes) return `(x) ${formatted}`;
	return formatted;
}

function humanTableHeader(result: ObjectiveListRenderResult): string {
	if (result.updated_branches_included === true) return "Objective | Status | Latest update | Updated branches\n--- | --- | --- | ---\n";
	return "Objective | Status | Latest update\n--- | --- | ---\n";
}

function humanRecordRows(record: ObjectiveListRenderRecord, shouldIncludeUpdatedBranches: boolean): string[] {
	const core = `${record.slug} | ${statusLabel(record.status)} | ${formatLatestUpdate(record)}`;
	if (!shouldIncludeUpdatedBranches) return [`${core}\n`];
	const branches = record.updated_branches ?? [];
	if (branches.length === 0) return [`${core} | —\n`];
	return branches.map((branch, index) => {
		const line = formatBranchLine(index + 1, branches.length, branch);
		if (index === 0) return `${core} | ${line}\n`;
		return ` |  |  | ${line}\n`;
	});
}

function markdownTableHeader(result: ObjectiveListRenderResult): string {
	if (result.updated_branches_included === true) return "| objective | status | latest update | updated branches |\n";
	return "| objective | status | latest update |\n";
}

function markdownTableSeparator(result: ObjectiveListRenderResult): string {
	if (result.updated_branches_included === true) return "| --- | --- | --- | --- |\n";
	return "| --- | --- | --- |\n";
}

function markdownRecordRow(record: ObjectiveListRenderRecord, shouldIncludeUpdatedBranches: boolean): string {
	const cells = [record.slug, statusLabel(record.status), formatLatestUpdate(record)];
	if (shouldIncludeUpdatedBranches) cells.push(formatUpdatedBranches(record));
	return `| ${cells.join(" | ")} |\n`;
}

function formatUpdatedBranches(record: ObjectiveListRecord): string {
	const branches = record.updated_branches ?? [];
	if (branches.length === 0) return "—";
	return branches.join(", ");
}

function formatBranchLine(index: number, branchCount: number, branch: string): string {
	const marker = index === branchCount ? "└" : "├";
	if (branchCount === 1) return `${marker} ${branch}`;
	return `${marker} ${index}/${branchCount} ${branch}`;
}

function stripRenderFields(exit: ClinkrExit<ObjectiveListRenderResult>): ClinkrExit<ObjectiveListResult> {
	switch (exit.type) {
		case "ok":
			return ok(factsOnly(exit.data));
		case "negative":
			return exit.data === undefined ? negative(exit.message) : negative(exit.message, factsOnly(exit.data));
		case "failure":
			return exit;
	}
}

function removeOneTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function factsOnly(result: ObjectiveListRenderResult): ObjectiveListResult {
	return {
		trunk_branch: result.trunk_branch,
		root_path: result.root_path,
		status_filter: result.status_filter,
		names_only: result.names_only,
		...(result.updated_branches_included === true ? { updated_branches_included: true } : {}),
		...(result.updated_branches_truncated === true ? { updated_branches_truncated: true } : {}),
		records: result.records.map((record) => ({
			slug: record.slug,
			status: record.status,
			latest_update_iso: record.latest_update_iso,
			...(result.updated_branches_included === true ? { updated_branches: [...(record.updated_branches ?? [])] } : {}),
		})),
	};
}

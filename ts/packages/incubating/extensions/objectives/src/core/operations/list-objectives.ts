import { resolveSettledNonInteractiveCaps, type Caps } from "@nseng-ai/clinkr";
import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	usageError,
	type ClinkrExit,
	type RenderCapabilities,
} from "@nseng-ai/clinkr/legacy";
import { z } from "zod";

import type { GitGateway } from "@nseng-ai/foundation/git";
import { glyph, type GlyphName, type Intent } from "@nseng-ai/foundation/cli-theme";
import { renderTextTable } from "@nseng-ai/foundation/text-table";

import type { ObjectiveCliContext } from "../context.ts";
import { isValidObjectiveOwner } from "../identity.ts";
import {
	activeRootRelativePath,
	type ObjectiveRecordLocation,
	type ObjectiveRecordStatus,
	type ObjectiveStorage,
} from "../storage.ts";

import { removeOneTrailingNewline } from "./format.ts";
import { buildObjectiveBranchAttributionForContext } from "./list-branch-attribution.ts";
import { readParsedObjectiveFrontmatter } from "./record-frontmatter-read.ts";

export const objectiveStatusFilterSchema = z.enum(["all", "active", "open", "closed"]);

export const listObjectivesRequestSchema = z.object({
	names: z.boolean().default(false).describe("Output Objective locators only, one per line."),
	status: objectiveStatusFilterSchema
		.default("active")
		.describe("Filter Objective records by checkout-local status."),
	owner: z
		.string()
		.optional()
		.describe("List only this owner's records (works without authentication)."),
	allOwners: z
		.boolean()
		.default(false)
		.describe("List records for every discovered owner (works without authentication)."),
});

/** Which owner namespace the listing covers. */
export const objectiveListOwnerScopeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("current"), owner: z.string() }),
	z.object({ type: z.literal("explicit"), owner: z.string() }),
	z.object({ type: z.literal("all") }),
]);

export const objectiveListRecordSchema = z.object({
	owner: z.string(),
	slug: z.string(),
	/** Durable Objective Locator `<owner>/<slug>`. */
	locator: z.string(),
	status: z.enum(["open", "closed"]),
	layout: z.enum(["owner-nested", "legacy-flat-closed"]),
	/**
	 * Present (true) only when Record Frontmatter carries a `blocked:` sentence. Blocked renders as
	 * human-facing state text, while `status` stays "open" for lifecycle/filtering semantics.
	 */
	isBlocked: z.boolean().optional(),
	latestUpdateIso: z.string().nullable(),
	/** Present only when Record Frontmatter declares at least one Objective Edge. */
	edgeCount: z.number().int().positive().optional(),
	/** Present only when at least one local non-trunk branch touches this Objective record. */
	updatedBranchCount: z.number().int().positive().optional(),
	hasOutstandingChanges: z.boolean(),
});

export const objectiveListResultSchema = z.object({
	trunkBranch: z.string(),
	rootPath: z.string(),
	statusFilter: objectiveStatusFilterSchema,
	ownerScope: objectiveListOwnerScopeSchema,
	namesOnly: z.boolean(),
	records: z.array(objectiveListRecordSchema),
});

export type ObjectiveStatusFilter = z.infer<typeof objectiveStatusFilterSchema>;
export type ListObjectivesRequest = z.infer<typeof listObjectivesRequestSchema>;
export type ObjectiveListOwnerScope = z.infer<typeof objectiveListOwnerScopeSchema>;
export type ObjectiveListRecord = z.infer<typeof objectiveListRecordSchema>;
export type ObjectiveListResult = z.infer<typeof objectiveListResultSchema>;

export async function runListObjectives(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<ClinkrExit<ObjectiveListResult>> {
	if (request.owner !== undefined && request.allOwners) {
		return usageError("Pass --owner or --all-owners, not both.", { argument: "owner" });
	}
	if (request.owner !== undefined && !isValidObjectiveOwner(request.owner)) {
		return usageError(`Invalid Objective owner handle: ${JSON.stringify(request.owner)}.`, {
			argument: "owner",
		});
	}
	const result = await buildObjectiveListResult(ctx, request);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	if (result.type === "git-error") return failure(result.error.code, result.error.message);
	if (result.type === "owner-unavailable") return negative(result.message);
	return ok(result.value);
}

export async function buildObjectiveListResult(
	ctx: ObjectiveCliContext,
	request: ListObjectivesRequest,
): Promise<
	| { type: "ok"; value: ObjectiveListResult }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
	| { type: "owner-unavailable"; message: string }
> {
	let ownerScope: ObjectiveListOwnerScope;
	if (request.allOwners) {
		ownerScope = { type: "all" };
	} else if (request.owner !== undefined) {
		ownerScope = { type: "explicit", owner: request.owner };
	} else {
		const currentOwner = await ctx.owner.resolveAuthenticatedOwner();
		if (currentOwner.type === "unavailable") {
			return {
				type: "owner-unavailable",
				message: `${currentOwner.message} Pass --owner <handle> or --all-owners to list without authentication.`,
			};
		}
		ownerScope = { type: "current", owner: currentOwner.owner };
	}

	const inventory = await ctx.storage.checkoutInventory();
	if (!inventory.ok) return { type: "storage-error", error: inventory.error };

	const filtered = inventory.value.records.filter(
		(record) =>
			matchesStatusFilter(record.status, request.status) &&
			(ownerScope.type === "all" || record.owner === ownerScope.owner),
	);

	const builtRecords = await Promise.all(
		filtered.map((location) =>
			buildObjectiveListRecord({
				storage: ctx.storage,
				git: ctx.git,
				repoRoot: ctx.repoRoot,
				location,
			}),
		),
	);
	const baseRecords: ObjectiveListRecord[] = [];
	for (const built of builtRecords) {
		if (built.type === "storage-error") return built;
		if (built.type === "git-error") return built;
		baseRecords.push(built.value);
	}

	const attribution = await buildObjectiveBranchAttributionForContext(ctx, filtered);
	if (attribution.type === "git-error") return attribution;

	const records = baseRecords.map((record) => {
		const updatedBranchCount =
			attribution.value.updatedBranchesByLocator.get(record.locator)?.length ?? 0;
		return {
			...record,
			...(updatedBranchCount > 0 ? { updatedBranchCount } : {}),
		};
	});

	return {
		type: "ok",
		value: {
			trunkBranch: ctx.trunkBranch,
			rootPath: activeRootRelativePath(),
			statusFilter: request.status,
			ownerScope,
			namesOnly: request.names,
			records,
		},
	};
}

export function ownerScopeLabel(scope: ObjectiveListOwnerScope): string {
	if (scope.type === "all") return "all owners";
	if (scope.type === "explicit") return `owner @${scope.owner}`;
	return `current owner @${scope.owner}`;
}

export function groupRecordsByOwner(
	records: readonly ObjectiveListRecord[],
): Map<string, ObjectiveListRecord[]> {
	const groups = new Map<string, ObjectiveListRecord[]>();
	for (const record of records) {
		const group = groups.get(record.owner) ?? [];
		group.push(record);
		groups.set(record.owner, group);
	}
	return groups;
}

export function renderObjectiveListHuman(
	result: ObjectiveListResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.namesOnly) return renderLocators(result.records);

	const parts = [
		"Objective records in this checkout\n",
		`Root: ${result.rootPath}\n`,
		`Owner scope: ${ownerScopeLabel(result.ownerScope)}\n`,
		`Status filter: ${result.statusFilter}\n`,
		"\n",
	];
	if (result.records.length === 0) {
		parts.push(`${emptyMessage(result.statusFilter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	const renderCaps = resolveRenderCapabilities(caps);
	for (const [owner, records] of groupRecordsByOwner(result.records)) {
		parts.push(`@${owner}\n`);
		parts.push(
			`${renderTextTable({
				columns: [
					{ header: "OBJECTIVE", style: "bold-cyan" },
					{ header: "STATUS" },
					{ header: "LATEST UPDATE", style: "dim" },
					{ header: "BRANCHES" },
					{ header: "EDGES" },
				],
				rows: records.map((record) => baseRecordCells(record, renderCaps)),
				canEmitAnsi: caps.canEmitAnsi,
				shouldDrawRule: true,
				headerStyle: "bold-cyan",
			})}\n`,
		);
	}
	return removeOneTrailingNewline(parts.join(""));
}

export function renderObjectiveListMarkdown(result: ObjectiveListResult): string {
	if (result.namesOnly) return renderLocators(result.records);

	const parts = [
		"# Objective records in this checkout\n",
		"\n",
		`Root: \`${result.rootPath}\`\n`,
		`Owner scope: \`${ownerScopeLabel(result.ownerScope)}\`\n`,
		`Status filter: \`${result.statusFilter}\`\n`,
	];
	if (result.records.length === 0) {
		parts.push("\n", `${emptyMessage(result.statusFilter)}\n`);
		return removeOneTrailingNewline(parts.join(""));
	}
	const markdownCaps = resolveSettledNonInteractiveCaps();
	for (const [owner, records] of groupRecordsByOwner(result.records)) {
		parts.push(
			"\n",
			`## @${owner}\n`,
			"\n",
			"| objective | status | latest update | branches | edges |\n",
			"| --- | --- | --- | --- | --- |\n",
		);
		for (const record of records) {
			parts.push(markdownRecordRow(record, markdownCaps));
		}
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
	location: ObjectiveRecordLocation;
}

async function buildObjectiveListRecord(
	options: BuildObjectiveListRecordOptions,
): Promise<
	| { type: "ok"; value: ObjectiveListRecord }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const relativePath = options.location.recordRelativePath;
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
			owner: options.location.owner,
			slug: options.location.slug,
			locator: options.location.locator,
			status: options.location.status,
			layout: options.location.layout,
			...(facts.isBlocked ? { isBlocked: true } : {}),
			latestUpdateIso: latestUpdateIsoFromUpdateNames(updates.value.map((update) => update.name)),
			...(facts.edgeCount > 0 ? { edgeCount: facts.edgeCount } : {}),
			hasOutstandingChanges: dirty.value,
		},
	};
}

interface ObjectiveListFrontmatterFacts {
	edgeCount: number;
	isBlocked: boolean;
}

/**
 * Record Frontmatter facts for the list surface, via the shared reader; the body is
 * never interpreted. Safe minimal rendering: a record whose `objective.md` is missing,
 * unreadable, or carries malformed frontmatter lists exactly like one with no frontmatter
 * (blank EDGES cell, no blocked indicator) — reporting malformed frontmatter is the
 * `ns objective check` linter's job, and the list must not error or mis-render over it.
 */
async function readListFrontmatterFacts(
	storage: ObjectiveStorage,
	recordRelativePath: string,
): Promise<ObjectiveListFrontmatterFacts> {
	const read = await storage.readObjectiveRecordDocument(recordRelativePath);
	const parsed = readParsedObjectiveFrontmatter(read);
	if (parsed.frontmatter === null) return { edgeCount: 0, isBlocked: false };
	return {
		edgeCount: parsed.frontmatter.edges.length,
		isBlocked: parsed.frontmatter.blocked !== null,
	};
}

function updateNameIso(name: string): string | null {
	// Objective update filenames are timestamp-prefixed; the canonical form is fully-compact
	// `YYYYMMDDTHHMMSSZ-slug.md`. The dashed forms below are accepted legacy spellings, and
	// non-timestamp names carry no latest-update facts. Keep this parser in sync with whatever
	// writes update files.
	const fullyCompact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-|\.md$)/u.exec(name);
	if (fullyCompact !== null) {
		return timestampPartsIso(
			`${fullyCompact[1]}-${fullyCompact[2]}-${fullyCompact[3]}`,
			fullyCompact[4] ?? "00",
			fullyCompact[5] ?? "00",
			fullyCompact[6] ?? "00",
		);
	}
	const compact = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-|\.md$)/u.exec(name);
	if (compact !== null)
		return timestampPartsIso(
			compact[1] ?? "",
			compact[2] ?? "00",
			compact[3] ?? "00",
			compact[4] ?? "00",
		);
	const minute = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(?:-|\.md$)/u.exec(name);
	if (minute !== null)
		return timestampPartsIso(minute[1] ?? "", minute[2] ?? "00", minute[3] ?? "00", "00");
	const extended = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})Z(?:-|\.md$)/u.exec(name);
	if (extended !== null)
		return timestampPartsIso(
			extended[1] ?? "",
			extended[2] ?? "00",
			extended[3] ?? "00",
			extended[4] ?? "00",
		);
	return null;
}

function timestampPartsIso(date: string, hour: string, minute: string, second: string): string {
	return `${date}T${hour}:${minute}:${second}Z`;
}

/** `--names` output: one full Objective Locator per line. */
export function renderLocators(records: readonly ObjectiveListRecord[]): string {
	return records.map((record) => record.locator).join("\n");
}

export type ObjectiveStatusPresentationInput = Pick<ObjectiveListRecord, "status" | "isBlocked">;

export interface ObjectiveStatusPresentation {
	glyphName: Extract<GlyphName, "open" | "done" | "blocked">;
	intent: Intent;
	word: "open" | "closed" | "blocked";
}

// Blocked remains an open lifecycle state for filtering and machine output, but human surfaces
// render the blocked state directly in the STATUS text instead of relying on a separate indicator.
export function objectiveStatusPresentation(
	record: ObjectiveStatusPresentationInput,
): ObjectiveStatusPresentation {
	if (record.status === "closed") {
		return { glyphName: "done", intent: "success", word: "closed" };
	}
	if (record.isBlocked === true) {
		return { glyphName: "blocked", intent: "warn", word: "blocked" };
	}
	return { glyphName: "open", intent: "accent", word: "open" };
}

function recordStatusCell(record: ObjectiveListRecord, caps: Caps): string {
	return formatStatusPlain(caps, objectiveStatusPresentation(record));
}

export function formatStatusPlain(caps: Caps, presentation: ObjectiveStatusPresentation): string {
	return `${glyph(caps, presentation.glyphName)} ${presentation.word}`;
}

export function edgeCountCell(record: ObjectiveListRecord): string {
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

export function updatedBranchCountCell(record: ObjectiveListRecord): string {
	return String(record.updatedBranchCount ?? 0);
}

function baseRecordCells(record: ObjectiveListRecord, caps: Caps): string[] {
	return [
		record.slug,
		recordStatusCell(record, caps),
		formatLatestUpdate(record),
		updatedBranchCountCell(record),
		edgeCountCell(record),
	];
}

function markdownRecordRow(record: ObjectiveListRecord, caps: Caps): string {
	const cells = baseRecordCells(record, caps);
	return `| ${cells.join(" | ")} |\n`;
}

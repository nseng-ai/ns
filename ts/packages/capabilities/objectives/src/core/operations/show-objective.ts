import { failure, negative, ok, type Caps, type ClinkrExit } from "@nseng-ai/clinkr";
import { bold, dim, glyph, paint, treeMarkers } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import type { ObjectiveRecordDocumentReadResult } from "../storage.ts";
import { activeRecordRelativePath, type ObjectiveStorage } from "../storage.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { handleObjectiveSlugValidationErrors } from "./slug-validation-errors.ts";
import { buildObjectiveBranchAttribution } from "./list-branch-attribution.ts";
import {
	latestUpdateIsoFromUpdateNames,
	objectiveStatusPresentation,
	type ObjectiveListRecord,
} from "./list-objectives.ts";
import { relativeTime } from "./list-objectives-pretty.ts";
import { resolveObjectiveRecordTarget } from "./objective-target.ts";

export const showObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to show."),
});

const showObjectiveEdgeCounterpartSchema = z.object({
	// active/archived/missing follows the same active-then-archive record resolution the edge linter uses.
	state: z.enum(["active", "archived", "missing"]),
	// Back-edge annotation naming this record in the counterpart's frontmatter; null when the
	// counterpart record or its back-edge is missing, unreadable, or malformed.
	annotation: z.string().nullable(),
});

const showObjectiveEdgeSchema = z.object({
	objective: z.string(),
	annotation: z.string(),
	counterpart: showObjectiveEdgeCounterpartSchema,
});

export const showObjectiveOkResultSchema = z.object({
	status: z.literal("ok"),
	slug: z.string(),
	path: z.string(),
	rootPath: z.string(),
	closed: z.boolean(),
	// Blocked Sentence from this record's own frontmatter parse; null when unblocked or without frontmatter.
	blockedSentence: z.string().nullable(),
	// Present only when this record's frontmatter is malformed; edge/blocked facts then read as empty,
	// exactly like a record with no frontmatter (reporting it is `ns objective check`'s job).
	frontmatterMalformed: z.string().optional(),
	latestUpdateIso: z.string().nullable(),
	updateCount: z.number().int(),
	hasOutstandingChanges: z.boolean(),
	updatedBranches: z.array(z.string()),
	updatedBranchesTruncated: z.boolean(),
	edges: z.array(showObjectiveEdgeSchema),
});

const showObjectiveNonOkBaseSchema = z.object({
	rootPath: z.string(),
	rootExists: z.boolean(),
	slug: z.string().nullable(),
	path: z.string().nullable(),
});

export const showObjectiveResultSchema = z.discriminatedUnion("status", [
	showObjectiveOkResultSchema,
	showObjectiveNonOkBaseSchema.extend({ status: z.literal("missing-slug") }),
	showObjectiveNonOkBaseSchema.extend({ status: z.literal("invalid-slug") }),
	showObjectiveNonOkBaseSchema.extend({ status: z.literal("not-found") }),
]);

export type ShowObjectiveRequest = z.infer<typeof showObjectiveRequestSchema>;
export type ShowObjectiveEdgeCounterpart = z.infer<typeof showObjectiveEdgeCounterpartSchema>;
export type ShowObjectiveEdge = z.infer<typeof showObjectiveEdgeSchema>;
export type ShowObjectiveOkResult = z.infer<typeof showObjectiveOkResultSchema>;
export type ShowObjectiveResult = z.infer<typeof showObjectiveResultSchema>;

export async function runShowObjective(
	ctx: ObjectiveCliContext,
	request: ShowObjectiveRequest,
): Promise<ClinkrExit<ShowObjectiveResult>> {
	const result = await buildShowObjectiveResult(ctx, request.slug);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	if (result.type === "git-error") return failure(result.error.code, result.error.message);
	const value = result.value;
	const slugValidationError = handleObjectiveSlugValidationErrors(value, request.slug);
	if (slugValidationError !== null) return slugValidationError;
	if (value.status === "not-found") {
		return negative(`No Objective record found for slug ${pythonStringRepr(value.slug ?? "")}.`, {
			data: value,
		});
	}
	return ok(value);
}

async function buildShowObjectiveResult(
	ctx: ObjectiveCliContext,
	slug: string | undefined,
): Promise<
	| { type: "ok"; value: ShowObjectiveResult }
	| { type: "storage-error"; error: { code: string; message: string } }
	| { type: "git-error"; error: { code: string; message: string } }
> {
	const targetResult = await resolveObjectiveRecordTarget(ctx.storage, slug);
	if (targetResult.type === "storage-error") return targetResult;
	const target = targetResult.value;
	if (target.status !== "found") {
		return {
			type: "ok",
			value: {
				status: target.status,
				rootPath: target.rootPath,
				rootExists: target.hasRoot,
				slug: target.slug,
				path: target.path,
			},
		};
	}

	const relativePath = target.path;
	const files = await ctx.storage.filePresence(relativePath);
	if (!files.ok) return { type: "storage-error", error: files.error };
	const updates = await ctx.storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };
	const dirty = await ctx.git.hasUncommittedChangesUnder({ cwd: ctx.repoRoot, relativePath });
	if (!dirty.ok) return { type: "git-error", error: dirty.error };
	const attribution = await buildObjectiveBranchAttribution(ctx.git, {
		repoRoot: ctx.repoRoot,
		trunkBranch: ctx.trunkBranch,
		slugs: new Set([target.slug]),
	});
	if (attribution.type === "git-error") return attribution;

	const document = await ctx.storage.readObjectiveRecordDocument(relativePath);
	const facts = frontmatterFacts(document);
	const edges: ShowObjectiveEdge[] = [];
	for (const edge of facts.edges) {
		const counterpart = await resolveEdgeCounterpart(ctx.storage, target.slug, edge.objective);
		if (counterpart.type === "storage-error") return counterpart;
		edges.push({
			objective: edge.objective,
			annotation: edge.annotation,
			counterpart: counterpart.value,
		});
	}

	return {
		type: "ok",
		value: {
			status: "ok",
			slug: target.slug,
			path: relativePath,
			rootPath: target.rootPath,
			closed: files.value.closedMd,
			blockedSentence: facts.blockedSentence,
			...(facts.malformed === undefined ? {} : { frontmatterMalformed: facts.malformed }),
			latestUpdateIso: latestUpdateIsoFromUpdateNames(updates.value.map((update) => update.name)),
			updateCount: updates.value.length,
			hasOutstandingChanges: dirty.value,
			updatedBranches: [...(attribution.value.updatedBranchesBySlug.get(target.slug) ?? [])],
			updatedBranchesTruncated: attribution.value.isTruncated,
			edges,
		},
	};
}

interface ShowObjectiveFrontmatterFacts {
	blockedSentence: string | null;
	edges: readonly { objective: string; annotation: string }[];
	malformed?: string;
}

/**
 * Own-side frontmatter facts for the show surface, via the shared reader (ADR 0025). Safe minimal
 * rendering matches the list surface: a record whose `objective.md` is missing, unreadable, or
 * carries malformed frontmatter yields no edges and no blocked sentence — only `check` reports the
 * malformed frontmatter, though `show` surfaces the parse message via `frontmatterMalformed`.
 */
function frontmatterFacts(read: ObjectiveRecordDocumentReadResult): ShowObjectiveFrontmatterFacts {
	if (read.type !== "ok") return { blockedSentence: null, edges: [] };
	const parse = read.document.frontmatter;
	if (parse === undefined) return { blockedSentence: null, edges: [] };
	if (parse.type === "malformed") {
		return { blockedSentence: null, edges: [], malformed: parse.message };
	}
	return { blockedSentence: parse.frontmatter.blocked, edges: parse.frontmatter.edges };
}

async function resolveEdgeCounterpart(
	storage: ObjectiveStorage,
	ownSlug: string,
	endpoint: string,
): Promise<
	| { type: "ok"; value: ShowObjectiveEdgeCounterpart }
	| { type: "storage-error"; error: { code: string; message: string } }
> {
	// Reuse the edge linter's active-then-archive resolution helper on `ObjectiveStorage`.
	const resolved = await storage.resolveRecordRelativePath(endpoint);
	if (!resolved.ok) return { type: "storage-error", error: resolved.error };
	if (resolved.value === null) {
		return { type: "ok", value: { state: "missing", annotation: null } };
	}
	const state = resolved.value === activeRecordRelativePath(endpoint) ? "active" : "archived";
	const read = await storage.readObjectiveRecordDocument(resolved.value);
	return { type: "ok", value: { state, annotation: backEdgeAnnotation(read, ownSlug) } };
}

function backEdgeAnnotation(
	read: ObjectiveRecordDocumentReadResult,
	ownSlug: string,
): string | null {
	if (read.type !== "ok") return null;
	const parse = read.document.frontmatter;
	if (parse === undefined || parse.type === "malformed") return null;
	const back = parse.frontmatter.edges.find((edge) => edge.objective === ownSlug);
	return back?.annotation ?? null;
}

export function renderShowObjectiveHuman(
	result: ShowObjectiveResult,
	caps: Caps,
	nowMs: number,
): string {
	if (result.status !== "ok") return "No Objective record selected.";

	const lines: string[] = [bold(`Objective ${result.slug}`)];
	const presentation = objectiveStatusPresentation(presentationRecord(result));
	const statusGlyph = paint(caps, presentation.intent, glyph(caps, presentation.glyphName));
	lines.push(`Status: ${statusGlyph} ${presentation.word}`);
	if (result.blockedSentence !== null) lines.push(`Blocked: ${result.blockedSentence}`);
	if (result.frontmatterMalformed !== undefined) {
		lines.push(dim(`Frontmatter malformed: ${result.frontmatterMalformed}`));
	}
	lines.push(`Root: ${result.rootPath}`);
	lines.push(`Path: ${result.path}`);

	const stamp = result.latestUpdateIso === null ? "—" : relativeTime(result.latestUpdateIso, nowMs);
	lines.push(`Latest update: ${stamp}  (updates: ${result.updateCount})`);
	lines.push(`Outstanding changes: ${result.hasOutstandingChanges ? "yes" : "no"}`);

	lines.push("", bold("Branches"));
	if (result.updatedBranches.length === 0) {
		lines.push(dim("No local branches touch this record."));
	} else {
		const markers = treeMarkers(caps);
		result.updatedBranches.forEach((branch, index) => {
			const marker = index === result.updatedBranches.length - 1 ? markers.last : markers.tee;
			lines.push(dim(`${marker} ${branch}`));
		});
	}
	if (result.updatedBranchesTruncated) {
		lines.push(dim("Branch attribution truncated; older updated branches may be omitted."));
	}

	lines.push("", bold("Edges"));
	if (result.edges.length === 0) {
		lines.push(dim("No Objective Edges declared."));
	} else {
		for (const edge of result.edges) {
			lines.push(`${edge.objective}  [${edge.counterpart.state}]`);
			lines.push(`  this record: ${edge.annotation}`);
			lines.push(`  ${edge.objective}: ${counterpartAnnotationText(edge.counterpart)}`);
		}
	}
	return lines.join("\n");
}

export function renderShowObjectiveMarkdown(result: ShowObjectiveResult): string {
	if (result.status !== "ok") return "_No Objective record selected._";

	const presentation = objectiveStatusPresentation(presentationRecord(result));
	const stamp = result.latestUpdateIso ?? "—";
	const parts = [`# Objective \`${result.slug}\`\n\n`, `Status: ${presentation.word}\n`];
	if (result.blockedSentence !== null) parts.push(`Blocked: ${result.blockedSentence}\n`);
	if (result.frontmatterMalformed !== undefined) {
		parts.push(`Frontmatter malformed: ${result.frontmatterMalformed}\n`);
	}
	parts.push(
		`Root: \`${result.rootPath}\`\n`,
		`Path: \`${result.path}\`\n`,
		`Latest update: ${stamp} (updates: ${result.updateCount})\n`,
		`Outstanding changes: ${result.hasOutstandingChanges ? "yes" : "no"}\n\n`,
	);

	parts.push("## Branches\n\n");
	if (result.updatedBranches.length === 0) {
		parts.push("_No local branches touch this record._\n\n");
	} else {
		for (const branch of result.updatedBranches) parts.push(`- \`${branch}\`\n`);
		parts.push("\n");
	}
	if (result.updatedBranchesTruncated) {
		parts.push("_Branch attribution truncated; older updated branches may be omitted._\n\n");
	}

	parts.push("## Edges\n\n");
	if (result.edges.length === 0) {
		parts.push("_No Objective Edges declared._\n");
	} else {
		for (const edge of result.edges) {
			parts.push(`### \`${edge.objective}\` (${edge.counterpart.state})\n\n`);
			parts.push(`- this record: ${edge.annotation}\n`);
			parts.push(`- \`${edge.objective}\`: ${counterpartAnnotationText(edge.counterpart)}\n\n`);
		}
	}
	return removeOneTrailingNewline(parts.join(""));
}

function counterpartAnnotationText(counterpart: ShowObjectiveEdgeCounterpart): string {
	return counterpart.annotation ?? "(no recorded back-edge annotation)";
}

function presentationRecord(result: ShowObjectiveOkResult): ObjectiveListRecord {
	return {
		slug: result.slug,
		status: result.closed ? "closed" : "open",
		...(result.blockedSentence === null ? {} : { isBlocked: true }),
		latestUpdateIso: result.latestUpdateIso,
		hasOutstandingChanges: result.hasOutstandingChanges,
	};
}

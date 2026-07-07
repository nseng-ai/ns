import { failure, negative, ok, type Caps, type ClinkrExit } from "@nseng-ai/clinkr";
import {
	bold,
	dim,
	glyph,
	paint,
	renderBufferedReport,
	treeMarkers,
	wrapPlain,
	type Intent,
} from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import type { ObjectiveRecordDocumentReadResult, ObjectiveStorage } from "../storage.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { handleObjectiveSlugValidationErrors } from "./slug-validation-errors.ts";
import { findObjectiveEdgeAnnotation } from "./edge-lint.ts";
import { buildObjectiveBranchAttributionForContext } from "./list-branch-attribution.ts";
import {
	latestUpdateIsoFromUpdateNames,
	objectiveStatusPresentation,
	type ObjectiveStatusPresentationInput,
} from "./list-objectives.ts";
import { relativeTime } from "./list-objectives-pretty.ts";
import { resolveObjectiveRecordTarget, targetToEmptyResultFields } from "./objective-target.ts";
import { readParsedObjectiveFrontmatter } from "./record-frontmatter-read.ts";

export const showObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to show."),
});

const showObjectiveEdgeCounterpartSchema = z.object({
	// Whether active-root-only record resolution found the counterpart record.
	exists: z.boolean(),
	// Closure marker presence for resolved counterpart records; null when the counterpart is missing.
	isClosed: z.boolean().nullable(),
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
	isClosed: z.boolean(),
	// Blocked Sentence from this record's own frontmatter parse; null when unblocked or without frontmatter.
	blockedSentence: z.string().nullable(),
	// Present only when this record's frontmatter is malformed; edge/blocked facts then read as empty,
	// exactly like a record with no frontmatter (reporting it is `ns objective check`'s job).
	frontmatterMalformed: z.string().optional(),
	latestUpdateIso: z.string().nullable(),
	updateCount: z.number().int(),
	hasOutstandingChanges: z.boolean(),
	updatedBranches: z.array(z.string()),
	isUpdatedBranchesTruncated: z.boolean(),
	edges: z.array(showObjectiveEdgeSchema),
});

const showObjectiveNonOkBaseSchema = z.object({
	rootPath: z.string(),
	hasRoot: z.boolean(),
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
				...targetToEmptyResultFields(target),
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
	const attribution = await buildObjectiveBranchAttributionForContext(ctx, new Set([target.slug]));
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
			isClosed: files.value.closedMd,
			blockedSentence: facts.blockedSentence,
			...(facts.malformed === undefined ? {} : { frontmatterMalformed: facts.malformed }),
			latestUpdateIso: latestUpdateIsoFromUpdateNames(updates.value.map((update) => update.name)),
			updateCount: updates.value.length,
			hasOutstandingChanges: dirty.value,
			updatedBranches: [...(attribution.value.updatedBranchesBySlug.get(target.slug) ?? [])],
			isUpdatedBranchesTruncated: attribution.value.isTruncated,
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
	const parsed = readParsedObjectiveFrontmatter(read);
	if (parsed.frontmatter === null) {
		return {
			blockedSentence: null,
			edges: [],
			...(parsed.malformed === undefined ? {} : { malformed: parsed.malformed }),
		};
	}
	return { blockedSentence: parsed.frontmatter.blocked, edges: parsed.frontmatter.edges };
}

async function resolveEdgeCounterpart(
	storage: ObjectiveStorage,
	ownSlug: string,
	endpoint: string,
): Promise<
	| { type: "ok"; value: ShowObjectiveEdgeCounterpart }
	| { type: "storage-error"; error: { code: string; message: string } }
> {
	const resolved = await storage.resolveRecordRelativePath(endpoint);
	if (!resolved.ok) return { type: "storage-error", error: resolved.error };
	if (resolved.value === null) {
		return { type: "ok", value: { exists: false, isClosed: null, annotation: null } };
	}
	const files = await storage.filePresence(resolved.value);
	if (!files.ok) return { type: "storage-error", error: files.error };
	const read = await storage.readObjectiveRecordDocument(resolved.value);
	return {
		type: "ok",
		value: { exists: true, isClosed: files.value.closedMd, annotation: backEdgeAnnotation(read, ownSlug) },
	};
}

function backEdgeAnnotation(
	read: ObjectiveRecordDocumentReadResult,
	ownSlug: string,
): string | null {
	const parsed = readParsedObjectiveFrontmatter(read);
	if (parsed.frontmatter === null) return null;
	return findObjectiveEdgeAnnotation(parsed.frontmatter, ownSlug);
}

export function renderShowObjectiveHuman(
	result: ShowObjectiveResult,
	caps: Caps,
	nowMs: number,
): string {
	if (result.status !== "ok") return "No Objective record selected.";

	const presentation = objectiveStatusPresentation(statusPresentationInput(result));
	const statusStyled = `${paint(caps, presentation.intent, glyph(caps, presentation.glyphName))} ${paint(
		caps,
		presentation.intent,
		presentation.word,
	)}`;
	return renderBufferedReport({
		caps: { canEmitAnsi: caps.colorDepth !== "none", caps },
		title: `${bold("Objective")} ${bold(paint(caps, "accent", result.slug))}  ${statusStyled}`,
		titleStyle: "plain",
		sections: [
			{ title: "", lines: summaryLines(result, caps, nowMs) },
			{ title: bold("Branches"), lines: renderBranchLines(result, caps) },
			{ title: bold("Edges"), lines: renderHumanEdgeSections(result.edges, caps) },
		],
	});
}

function summaryLines(result: ShowObjectiveOkResult, caps: Caps, nowMs: number): string[] {
	const lines = [dim(subtitleLine(result, caps, nowMs))];
	if (result.hasOutstandingChanges) {
		lines.push(paint(caps, "warn", "Uncommitted changes not yet recorded in an update."));
	}
	if (result.blockedSentence !== null) {
		lines.push(
			...labeledWrappedBlock({
				caps,
				label: "Blocked",
				labelStyled: paint(caps, "warn", bold("Blocked")),
				text: result.blockedSentence,
			}),
		);
	}
	if (result.frontmatterMalformed !== undefined) {
		lines.push(...dimWrappedLines(caps, `Frontmatter malformed: ${result.frontmatterMalformed}`));
	}
	return lines;
}

function renderBranchLines(result: ShowObjectiveOkResult, caps: Caps): string[] {
	const lines: string[] = [];
	if (result.updatedBranches.length === 0) {
		lines.push(dim("No local branches touch this record."));
	} else {
		const markers = treeMarkers(caps);
		result.updatedBranches.forEach((branch, index) => {
			const marker = index === result.updatedBranches.length - 1 ? markers.last : markers.tee;
			lines.push(`${dim(marker)} ${branch}`);
		});
	}
	if (result.isUpdatedBranchesTruncated) {
		lines.push(
			...dimWrappedLines(
				caps,
				"Branch attribution truncated; older updated branches may be omitted.",
			),
		);
	}
	return lines;
}

function renderHumanEdgeSections(edges: readonly ShowObjectiveEdge[], caps: Caps): string[] {
	if (edges.length === 0) return [dim("No Objective Edges declared.")];
	return edges.flatMap((edge) => renderEdgeLines(edge, caps));
}

function contentWidth(caps: Caps, reserved = 0): number {
	return Math.max(20, caps.columns) - reserved;
}

function dimWrappedLines(caps: Caps, text: string): string[] {
	return wrapPlain(text, contentWidth(caps)).map((line) => dim(line));
}

function subtitleLine(result: ShowObjectiveOkResult, caps: Caps, nowMs: number): string {
	const separator = caps.canRenderUnicode ? "  ·  " : "  -  ";
	const updatesFact =
		result.updateCount === 0
			? "no updates"
			: `${result.updateCount} update${result.updateCount === 1 ? "" : "s"}`;
	const parts = [result.path, updatesFact];
	if (result.latestUpdateIso !== null) {
		parts.push(`latest ${relativeTime(result.latestUpdateIso, nowMs)}`);
	}
	return parts.join(separator);
}

/** Label + prose with a hanging indent: wrap the plain text first, then prefix and style. */
function labeledWrappedBlock(options: {
	caps: Caps;
	label: string;
	labelStyled: string;
	text: string;
}): string[] {
	const indent = options.label.length + 2;
	const width = contentWidth(options.caps, indent);
	return wrapPlain(options.text, width).map((line, index) =>
		index === 0 ? `${options.labelStyled}  ${line}` : `${" ".repeat(indent)}${line}`,
	);
}

function counterpartIntent(counterpart: ShowObjectiveEdgeCounterpart): Intent {
	if (!counterpart.exists) return "error";
	if (counterpart.isClosed === true) return "warn";
	return "muted";
}

function counterpartLabel(counterpart: ShowObjectiveEdgeCounterpart): string {
	if (counterpart.exists) return "found";
	return "missing";
}

// The counterpart's back-edge annotation is deliberately absent from the human surface: in the
// healthy case it restates the own-side annotation. Both sides remain on `--format md`.
function renderEdgeLines(edge: ShowObjectiveEdge, caps: Caps): string[] {
	const intent = counterpartIntent(edge.counterpart);
	const label = edge.counterpart.isClosed === true ? "closed" : counterpartLabel(edge.counterpart);
	const glyphName = edge.counterpart.isClosed === true ? "done" : "open";
	const lines = [
		`${paint(caps, intent, glyph(caps, glyphName))} ${bold(paint(caps, "accent", edge.objective))}  ${paint(
			caps,
			intent,
			label,
		)}`,
	];
	const width = contentWidth(caps, 4);
	for (const line of wrapPlain(edge.annotation, width)) lines.push(`    ${dim(line)}`);
	return lines;
}

export function renderShowObjectiveMarkdown(result: ShowObjectiveResult): string {
	if (result.status !== "ok") return "_No Objective record selected._";

	const presentation = objectiveStatusPresentation(statusPresentationInput(result));
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
	if (result.isUpdatedBranchesTruncated) {
		parts.push("_Branch attribution truncated; older updated branches may be omitted._\n\n");
	}

	parts.push("## Edges\n\n");
	if (result.edges.length === 0) {
		parts.push("_No Objective Edges declared._\n");
	} else {
		for (const edge of result.edges) {
			const label = edge.counterpart.isClosed === true ? "closed" : counterpartLabel(edge.counterpart);
			parts.push(`### \`${edge.objective}\` (${label})\n\n`);
			parts.push(`- this record: ${edge.annotation}\n`);
			parts.push(`- \`${edge.objective}\`: ${counterpartAnnotationText(edge.counterpart)}\n\n`);
		}
	}
	return removeOneTrailingNewline(parts.join(""));
}

function counterpartAnnotationText(counterpart: ShowObjectiveEdgeCounterpart): string {
	return counterpart.annotation ?? "(no recorded back-edge annotation)";
}

function statusPresentationInput(result: ShowObjectiveOkResult): ObjectiveStatusPresentationInput {
	return {
		status: result.isClosed ? "closed" : "open",
		...(result.blockedSentence === null ? {} : { isBlocked: true }),
	};
}

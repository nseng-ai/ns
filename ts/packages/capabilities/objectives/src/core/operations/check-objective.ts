import {
	failure,
	negative,
	ok,
	resolveRenderCapabilities,
	type ClinkrExit,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import { cell, kv, paint, renderTable } from "@nseng-ai/foundation/cli-theme";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { handleObjectiveSlugValidationErrors } from "./slug-validation-errors.ts";
import {
	emptyObjectiveFiles,
	objectiveFilesSchema,
	objectiveUpdateFileSchema,
	renderFilePresence,
	type ObjectiveFiles,
	type ObjectiveMarkdownReadResult,
	type ObjectiveRecordDocumentReadResult,
	type ObjectiveStorage,
	type ObjectiveUpdateFile,
} from "../storage.ts";
import {
	checkItem,
	countIssues,
	objectiveCheckItemSchema,
	objectiveMdExistsCheck,
	objectiveMdReadableCheck,
} from "./check-items.ts";
import type { ObjectiveCheckItem } from "./check-items.ts";
import { objectiveEdgeLintChecks } from "./edge-lint.ts";
import { resolveObjectiveRecordTarget, targetToEmptyResultFields } from "./objective-target.ts";

const requiredObjectiveHeadings = [
	"## Thesis",
	"## Scope",
	"## Non-Goals",
	"## Completion Criteria",
	"## Assumptions and Risks",
	"## Open Questions",
] as const;
const requiredRoadmapHeadings = ["# Roadmap", "## Work", "## Parked"] as const;
const requiredUpdateHeadings = ["## Summary", "## Objective Impact", "## Follow-Ups"] as const;

export const checkObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to check."),
	skipUpdateFormatChecks: z
		.boolean()
		.optional()
		.describe("Skip title and required-heading checks for Semantic Updates."),
});

export const checkObjectiveBaseResultSchema = z.object({
	error: z.string().nullable(),
	rootPath: z.string(),
	hasRoot: z.boolean(),
	slug: z.string().nullable(),
	path: z.string().nullable(),
	hasRecord: z.boolean(),
	isClosed: z.boolean(),
	files: objectiveFilesSchema,
	updates: z.array(objectiveUpdateFileSchema),
	updateCount: z.number().int(),
	checks: z.array(objectiveCheckItemSchema),
	errorCount: z.number().int(),
	warningCount: z.number().int(),
});

export const checkObjectiveMissingSlugResultSchema = checkObjectiveBaseResultSchema.extend({
	status: z.literal("missing-slug"),
});
export const checkObjectiveInvalidSlugResultSchema = checkObjectiveBaseResultSchema.extend({
	status: z.literal("invalid-slug"),
});
export const checkObjectiveNotFoundResultSchema = checkObjectiveBaseResultSchema.extend({
	status: z.literal("not-found"),
});

export const checkObjectiveNonSelectedResultSchema = z.discriminatedUnion("status", [
	checkObjectiveMissingSlugResultSchema,
	checkObjectiveInvalidSlugResultSchema,
	checkObjectiveNotFoundResultSchema,
]);

export const checkObjectiveEvaluatedBaseResultSchema = checkObjectiveBaseResultSchema.extend({
	slug: z.string(),
	path: z.string(),
	hasRecord: z.literal(true),
});

export const checkObjectiveOkResultSchema = checkObjectiveEvaluatedBaseResultSchema.extend({
	status: z.literal("ok"),
	error: z.null(),
});

export const checkObjectiveFailedResultSchema = checkObjectiveEvaluatedBaseResultSchema.extend({
	status: z.literal("failed"),
	error: z.literal("check-failed"),
});

export const checkObjectiveResultSchema = z.discriminatedUnion("status", [
	checkObjectiveOkResultSchema,
	checkObjectiveFailedResultSchema,
	checkObjectiveMissingSlugResultSchema,
	checkObjectiveInvalidSlugResultSchema,
	checkObjectiveNotFoundResultSchema,
]);

export type CheckObjectiveRequest = z.infer<typeof checkObjectiveRequestSchema>;
export type CheckObjectiveResult = z.infer<typeof checkObjectiveResultSchema>;
type CheckObjectiveStatus = CheckObjectiveResult["status"];

export async function runCheckObjective(
	ctx: ObjectiveCliContext,
	request: CheckObjectiveRequest,
): Promise<ClinkrExit<CheckObjectiveResult>> {
	const result = await checkObjective(
		ctx.storage,
		request.slug,
		request.skipUpdateFormatChecks === true,
	);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	const slugValidationError = handleObjectiveSlugValidationErrors(result.value, request.slug);
	if (slugValidationError !== null) return slugValidationError;
	if (result.value.status === "not-found") {
		return negative(
			`No Objective record found for slug ${pythonStringRepr(result.value.slug ?? "")}.`,
			{ data: result.value },
		);
	}
	if (result.value.status === "failed") {
		return negative(
			`Objective check failed for slug ${pythonStringRepr(result.value.slug ?? "")}: ${result.value.errorCount} error(s), ${result.value.warningCount} warning(s).`,
			{ data: result.value },
		);
	}
	return ok(result.value);
}

export function renderCheckObjective(
	result: CheckObjectiveResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	if (
		result.status === "missing-slug" ||
		result.status === "invalid-slug" ||
		result.status === "not-found"
	) {
		const label =
			result.status === "not-found" && result.slug !== null
				? `No Objective record found for ${result.slug}.`
				: "No Objective record selected.";
		return [label, kv(renderCaps, "Root", rootPresence(result))].join("\n");
	}

	const state = result.isClosed ? "closed" : "open";
	const rows = renderTable({
		caps: renderCaps,
		columns: [
			{ header: "STATUS", width: "auto" },
			{ header: "SEVERITY", width: "auto" },
			{ header: "CHECK", width: "fill", min: "CHECK".length },
			{ header: "DETAIL", width: "auto" },
		],
		rows: result.checks.map((check) => [
			checkStatusCell(renderCaps, check),
			cell(check.severity),
			cell(check.label),
			cell(check.detail),
		]),
	});
	return removeOneTrailingNewline(
		[
			`Objective check ${result.slug}`,
			"",
			kv(renderCaps, "Root", rootPresence(result)),
			kv(renderCaps, "Path", result.path),
			kv(renderCaps, "State", state),
			kv(renderCaps, "Files", renderFilePresence(result.files)),
			kv(renderCaps, "Updates", String(result.updateCount)),
			kv(
				renderCaps,
				"Result",
				`${result.status} (${result.errorCount} error(s), ${result.warningCount} warning(s))`,
			),
			"",
			...rows,
		].join("\n"),
	);
}

async function checkObjective(
	storage: ObjectiveStorage,
	slug: string | undefined,
	skipUpdateFormatChecks: boolean,
): Promise<
	| { type: "ok"; value: CheckObjectiveResult }
	| { type: "storage-error"; error: { code: string; message: string } }
> {
	const targetResult = await resolveObjectiveRecordTarget(storage, slug);
	if (targetResult.type === "storage-error") return targetResult;
	const target = targetResult.value;
	if (target.status !== "found") {
		return {
			type: "ok",
			value: emptyResult({
				status: target.status,
				error: target.status,
				...targetToEmptyResultFields(target),
			}),
		};
	}

	const relativePath = target.path;
	const files = await storage.filePresence(relativePath);
	if (!files.ok) return { type: "storage-error", error: files.error };
	const updates = await storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };

	const objectiveMd = await storage.readObjectiveRecordDocument(relativePath);
	const edgeLint =
		objectiveMd.type === "ok"
			? await objectiveEdgeLintChecks({
					storage,
					slug: target.slug,
					recordRelativePath: relativePath,
					document: objectiveMd.document,
				})
			: null;
	if (edgeLint !== null && !edgeLint.ok) return { type: "storage-error", error: edgeLint.error };
	const roadmapMd = await storage.readMarkdownFile(`${relativePath}/roadmap.md`);
	const updateChecks = files.value.updatesDir
		? await Promise.all(
				updates.value.map(async (update) =>
					updateMarkdownChecks({
						update,
						read: await storage.readMarkdownFile(`${relativePath}/updates/${update.name}`),
						skipFormatChecks: skipUpdateFormatChecks,
					}),
				),
			)
		: [];
	const checks = [
		...filePresenceChecks(relativePath, files.value),
		...objectiveMarkdownChecks({
			path: `${relativePath}/objective.md`,
			read: objectiveMd,
			hasClosedMarker: files.value.closedMd,
		}),
		...(edgeLint === null ? [] : edgeLint.value),
		...roadmapMarkdownChecks({ path: `${relativePath}/roadmap.md`, read: roadmapMd }),
		...updateChecks.flat(),
	];

	const errorCount = countIssues(checks, "error");
	const warningCount = countIssues(checks, "warning");
	const evaluatedFacts = {
		rootPath: target.rootPath,
		hasRoot: target.hasRoot,
		slug: target.slug,
		path: relativePath,
		hasRecord: true as const,
		isClosed: files.value.closedMd,
		files: files.value,
		updates: [...updates.value],
		updateCount: updates.value.length,
		checks,
		errorCount,
		warningCount,
	};
	if (errorCount === 0) {
		return { type: "ok", value: { ...evaluatedFacts, status: "ok", error: null } };
	}
	return { type: "ok", value: { ...evaluatedFacts, status: "failed", error: "check-failed" } };
}

function rootPresence(result: CheckObjectiveResult): string {
	return `${result.rootPath} (${result.hasRoot ? "present" : "missing"})`;
}

function checkStatusCell(
	caps: ReturnType<typeof resolveRenderCapabilities>,
	check: ObjectiveCheckItem,
) {
	if (check.isPassed) return cell(paint(caps, "success", "ok"), "ok");
	const text = check.severity === "warning" ? "warn" : "fail";
	return cell(paint(caps, check.severity === "warning" ? "warn" : "error", text), text);
}

function emptyResult(options: {
	status: Exclude<CheckObjectiveStatus, "ok" | "failed">;
	error: string;
	rootPath: string;
	slug: string | null;
	path: string | null;
	hasRoot: boolean;
}): CheckObjectiveResult {
	return {
		status: options.status,
		error: options.error,
		rootPath: options.rootPath,
		hasRoot: options.hasRoot,
		slug: options.slug,
		path: options.path,
		hasRecord: false,
		isClosed: false,
		files: emptyObjectiveFiles(),
		updates: [],
		updateCount: 0,
		checks: [],
		errorCount: 0,
		warningCount: 0,
	};
}

function filePresenceChecks(relativePath: string, files: ObjectiveFiles): ObjectiveCheckItem[] {
	return [
		objectiveMdExistsCheck({ recordRelativePath: relativePath, isPresent: files.objectiveMd }),
		checkItem({
			path: `${relativePath}/roadmap.md`,
			label: "roadmap.md exists",
			isPassed: files.roadmapMd,
			severity: "error",
			passDetail: "present",
			failDetail: "missing",
		}),
		checkItem({
			path: `${relativePath}/updates`,
			label: "updates/ directory exists",
			isPassed: files.updatesDir,
			severity: "error",
			passDetail: "present",
			failDetail: "missing",
		}),
	];
}

function objectiveMarkdownChecks(options: {
	path: string;
	read: ObjectiveRecordDocumentReadResult;
	hasClosedMarker: boolean;
}): ObjectiveCheckItem[] {
	const read = options.read;
	if (read.type === "missing") return [];
	const readableChecks = [objectiveMdReadableCheck({ path: options.path, read })];
	if (read.type !== "ok") return readableChecks;

	// Heading lints run on the frontmatter-stripped body so a Record Frontmatter
	// fence or its YAML lines are never treated as record content (ADR 0025).
	const body = read.document.body;
	const hasClosureHeading = hasExactHeading(body, "## Closure");
	const closureCheck = options.hasClosedMarker
		? checkItem({
				path: options.path,
				label: "objective.md has ## Closure for closed Objective",
				isPassed: hasClosureHeading,
				severity: "error",
				passDetail: "present",
				failDetail: "missing while closed.md exists",
			})
		: checkItem({
				path: options.path,
				label: "objective.md omits ## Closure for open Objective",
				isPassed: !hasClosureHeading,
				severity: "warning",
				passDetail: "absent",
				failDetail: "present without closed.md",
			});
	return [
		...readableChecks,
		...requiredObjectiveHeadings.map((heading) =>
			headingCheck({
				path: options.path,
				displayPath: "objective.md",
				content: body,
				heading,
				severity: "error",
			}),
		),
		closureCheck,
	];
}

function roadmapMarkdownChecks(options: {
	path: string;
	read: ObjectiveMarkdownReadResult;
}): ObjectiveCheckItem[] {
	const read = options.read;
	if (read.type === "missing") return [];
	const readableChecks = readableMarkdownChecks({
		path: options.path,
		displayPath: "roadmap.md",
		read,
	});
	if (read.type !== "ok") return readableChecks;
	return [
		...readableChecks,
		...requiredRoadmapHeadings.map((heading) =>
			headingCheck({
				path: options.path,
				displayPath: "roadmap.md",
				content: read.content,
				heading,
				severity: "error",
			}),
		),
	];
}

function updateMarkdownChecks(options: {
	update: ObjectiveUpdateFile;
	read: ObjectiveMarkdownReadResult;
	skipFormatChecks: boolean;
}): ObjectiveCheckItem[] {
	const read = options.read;
	if (read.type === "missing") return [];
	const displayPath = `updates/${options.update.name}`;
	const readableChecks = readableMarkdownChecks({
		path: options.update.path,
		displayPath,
		read,
	});
	if (read.type !== "ok" || options.skipFormatChecks) return readableChecks;
	return [
		...readableChecks,
		checkItem({
			path: options.update.path,
			label: `${displayPath} has title heading`,
			isPassed: hasTitleHeading(read.content),
			severity: "error",
			passDetail: "present",
			failDetail: "missing # title",
		}),
		...requiredUpdateHeadings.map((heading) =>
			headingCheck({
				path: options.update.path,
				displayPath,
				content: read.content,
				heading,
				severity: "error",
			}),
		),
	];
}

function readableMarkdownChecks(options: {
	path: string;
	displayPath: string;
	read: Exclude<ObjectiveMarkdownReadResult, { type: "missing" }>;
}): ObjectiveCheckItem[] {
	return [
		checkItem({
			path: options.path,
			label: `${options.displayPath} is readable Markdown`,
			isPassed: options.read.type === "ok",
			severity: "error",
			passDetail: "readable",
			failDetail: options.read.type === "ok" ? "unreadable" : options.read.message,
		}),
	];
}

function headingCheck(options: {
	path: string;
	displayPath: string;
	content: string;
	heading: string;
	severity: ObjectiveCheckItem["severity"];
}): ObjectiveCheckItem {
	return checkItem({
		path: options.path,
		label: `${options.displayPath} has ${options.heading}`,
		isPassed: hasExactHeading(options.content, options.heading),
		severity: options.severity,
		passDetail: "present",
		failDetail: "missing",
	});
}

function hasExactHeading(content: string, heading: string): boolean {
	return content.split(/\r?\n/u).some((line) => line.trimEnd() === heading);
}

function hasTitleHeading(content: string): boolean {
	return content.split(/\r?\n/u).some((line) => /^#\s+\S/u.test(line));
}

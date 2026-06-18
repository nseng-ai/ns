import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { objectiveFilesSchema, objectiveUpdateFileSchema } from "./read-objective.ts";
import { handleObjectiveSlugValidationErrors } from "./slug-validation-errors.ts";
import {
	activeRecordRelativePath,
	activeRootRelativePath,
	emptyObjectiveFiles,
	isValidObjectiveSlug,
	renderFilePresence,
	type ObjectiveFiles,
	type ObjectiveMarkdownReadResult,
	type ObjectiveStorage,
	type ObjectiveUpdateFile,
} from "../storage.ts";

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
});

export const objectiveCheckItemSchema = z.object({
	path: z.string(),
	label: z.string(),
	ok: z.boolean(),
	severity: z.enum(["error", "warning"]),
	detail: z.string(),
});

export const checkObjectiveBaseResultSchema = z.object({
	error: z.string().nullable(),
	rootPath: z.string(),
	hasRoot: z.boolean(),
	slug: z.string().nullable(),
	path: z.string().nullable(),
	exists: z.boolean(),
	closed: z.boolean(),
	files: objectiveFilesSchema,
	updates: z.array(objectiveUpdateFileSchema),
	updateCount: z.number().int(),
	checks: z.array(objectiveCheckItemSchema),
	errorCount: z.number().int(),
	warningCount: z.number().int(),
});

export const checkObjectiveNonSelectedResultSchema = z.discriminatedUnion("status", [
	checkObjectiveBaseResultSchema.extend({ status: z.literal("missing_slug") }),
	checkObjectiveBaseResultSchema.extend({ status: z.literal("invalid_slug") }),
	checkObjectiveBaseResultSchema.extend({ status: z.literal("not_found") }),
]);

export const checkObjectiveEvaluatedBaseResultSchema = checkObjectiveBaseResultSchema.extend({
	slug: z.string(),
	path: z.string(),
	exists: z.literal(true),
});

export const checkObjectiveOkResultSchema = checkObjectiveEvaluatedBaseResultSchema.extend({
	status: z.literal("ok"),
	error: z.null(),
});

export const checkObjectiveFailedResultSchema = checkObjectiveEvaluatedBaseResultSchema.extend({
	status: z.literal("failed"),
	error: z.literal("check_failed"),
});

export const checkObjectiveResultSchema = z.discriminatedUnion("status", [
	checkObjectiveOkResultSchema,
	checkObjectiveFailedResultSchema,
	checkObjectiveBaseResultSchema.extend({ status: z.literal("missing_slug") }),
	checkObjectiveBaseResultSchema.extend({ status: z.literal("invalid_slug") }),
	checkObjectiveBaseResultSchema.extend({ status: z.literal("not_found") }),
]);

export type CheckObjectiveRequest = z.infer<typeof checkObjectiveRequestSchema>;
export type ObjectiveCheckItem = z.infer<typeof objectiveCheckItemSchema>;
export type CheckObjectiveResult = z.infer<typeof checkObjectiveResultSchema>;
type CheckObjectiveStatus = CheckObjectiveResult["status"];

export async function runCheckObjective(
	ctx: ObjectiveCliContext,
	request: CheckObjectiveRequest,
): Promise<ClinkrExit<CheckObjectiveResult>> {
	const result = await checkObjective(ctx.storage, request.slug);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	const slugValidationError = handleObjectiveSlugValidationErrors(result.value, request.slug);
	if (slugValidationError !== null) return slugValidationError;
	if (result.value.status === "not_found") {
		return negative(
			`No Objective record found for slug ${pythonStringRepr(result.value.slug ?? "")}.`,
			result.value,
		);
	}
	if (result.value.status === "failed") {
		return negative(
			`Objective check failed for slug ${pythonStringRepr(result.value.slug ?? "")}: ${result.value.errorCount} error(s), ${result.value.warningCount} warning(s).`,
			result.value,
		);
	}
	return ok(result.value);
}

export function renderCheckObjective(result: CheckObjectiveResult): string {
	if (
		result.status === "missing_slug" ||
		result.status === "invalid_slug" ||
		result.status === "not_found"
	) {
		return "No Objective record selected.";
	}

	const rootState = result.hasRoot ? "present" : "missing";
	const state = result.closed ? "closed" : "open";
	const parts = [
		`Objective check \`${result.slug}\`\n`,
		`Root: ${result.rootPath} (${rootState})\n`,
		`Path: ${result.path}\n`,
		`State: ${state}\n`,
		`Files: ${renderFilePresence(result.files)}\n`,
		`Updates: ${result.updateCount}\n`,
		`Result: ${result.status} (${result.errorCount} error(s), ${result.warningCount} warning(s))\n`,
		"\n",
	];
	for (const check of result.checks) {
		parts.push(`${check.ok ? "✓" : "✗"} ${check.label}: ${check.detail}\n`);
	}
	return removeOneTrailingNewline(parts.join(""));
}

async function checkObjective(
	storage: ObjectiveStorage,
	slug: string | undefined,
): Promise<
	| { type: "ok"; value: CheckObjectiveResult }
	| { type: "storage-error"; error: { code: string; message: string } }
> {
	const root = activeRootRelativePath();
	const rootPresence = await storage.activeRootExists();
	if (!rootPresence.ok) return { type: "storage-error", error: rootPresence.error };

	if (slug === undefined) {
		return {
			type: "ok",
			value: emptyResult({
				status: "missing_slug",
				error: "missing_slug",
				rootPath: root,
				slug: null,
				path: null,
				hasRoot: rootPresence.value,
			}),
		};
	}
	if (!isValidObjectiveSlug(slug)) {
		return {
			type: "ok",
			value: emptyResult({
				status: "invalid_slug",
				error: "invalid_slug",
				rootPath: root,
				slug: null,
				path: null,
				hasRoot: rootPresence.value,
			}),
		};
	}

	const relativePath = activeRecordRelativePath(slug);
	const exists = await storage.activeRecordExists(slug);
	if (!exists.ok) return { type: "storage-error", error: exists.error };
	if (!exists.value) {
		return {
			type: "ok",
			value: emptyResult({
				status: "not_found",
				error: "not_found",
				rootPath: root,
				slug,
				path: relativePath,
				hasRoot: rootPresence.value,
			}),
		};
	}

	const files = await storage.filePresence(relativePath);
	if (!files.ok) return { type: "storage-error", error: files.error };
	const updates = await storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };

	const objectiveMd = await storage.readMarkdownFile(`${relativePath}/objective.md`);
	const roadmapMd = await storage.readMarkdownFile(`${relativePath}/roadmap.md`);
	const updateChecks = files.value.updatesDir
		? await Promise.all(
				updates.value.map(async (update) =>
					updateMarkdownChecks({
						update,
						read: await storage.readMarkdownFile(`${relativePath}/updates/${update.name}`),
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
		...roadmapMarkdownChecks({ path: `${relativePath}/roadmap.md`, read: roadmapMd }),
		...updateChecks.flat(),
	];

	const errorCount = countIssues(checks, "error");
	const warningCount = countIssues(checks, "warning");
	const evaluatedFacts = {
		rootPath: root,
		hasRoot: rootPresence.value,
		slug,
		path: relativePath,
		exists: true as const,
		closed: files.value.closedMd,
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
	return { type: "ok", value: { ...evaluatedFacts, status: "failed", error: "check_failed" } };
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
		exists: false,
		closed: false,
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
		checkItem({
			path: `${relativePath}/objective.md`,
			label: "objective.md exists",
			ok: files.objectiveMd,
			severity: "error",
			passDetail: "present",
			failDetail: "missing",
		}),
		checkItem({
			path: `${relativePath}/roadmap.md`,
			label: "roadmap.md exists",
			ok: files.roadmapMd,
			severity: "error",
			passDetail: "present",
			failDetail: "missing",
		}),
		checkItem({
			path: `${relativePath}/updates`,
			label: "updates/ directory exists",
			ok: files.updatesDir,
			severity: "error",
			passDetail: "present",
			failDetail: "missing",
		}),
	];
}

function objectiveMarkdownChecks(options: {
	path: string;
	read: ObjectiveMarkdownReadResult;
	hasClosedMarker: boolean;
}): ObjectiveCheckItem[] {
	const read = options.read;
	if (read.type === "missing") return [];
	const readableChecks = readableMarkdownChecks({
		path: options.path,
		displayPath: "objective.md",
		read,
	});
	if (read.type !== "ok") return readableChecks;

	const hasClosureHeading = hasExactHeading(read.content, "## Closure");
	const closureCheck = options.hasClosedMarker
		? checkItem({
				path: options.path,
				label: "objective.md has ## Closure for closed Objective",
				ok: hasClosureHeading,
				severity: "error",
				passDetail: "present",
				failDetail: "missing while closed.md exists",
			})
		: checkItem({
				path: options.path,
				label: "objective.md omits ## Closure for open Objective",
				ok: !hasClosureHeading,
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
				content: read.content,
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
}): ObjectiveCheckItem[] {
	const read = options.read;
	if (read.type === "missing") return [];
	const displayPath = `updates/${options.update.name}`;
	const readableChecks = readableMarkdownChecks({
		path: options.update.path,
		displayPath,
		read,
	});
	if (read.type !== "ok") return readableChecks;
	return [
		...readableChecks,
		checkItem({
			path: options.update.path,
			label: `${displayPath} has title heading`,
			ok: hasTitleHeading(read.content),
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
			ok: options.read.type === "ok",
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
		ok: hasExactHeading(options.content, options.heading),
		severity: options.severity,
		passDetail: "present",
		failDetail: "missing",
	});
}

function checkItem(options: {
	path: string;
	label: string;
	ok: boolean;
	severity: ObjectiveCheckItem["severity"];
	passDetail: string;
	failDetail: string;
}): ObjectiveCheckItem {
	return {
		path: options.path,
		label: options.label,
		ok: options.ok,
		severity: options.severity,
		detail: options.ok ? options.passDetail : options.failDetail,
	};
}

function hasExactHeading(content: string, heading: string): boolean {
	return content.split(/\r?\n/u).some((line) => line.trimEnd() === heading);
}

function hasTitleHeading(content: string): boolean {
	return content.split(/\r?\n/u).some((line) => /^#\s+\S/u.test(line));
}

function countIssues(
	checks: readonly ObjectiveCheckItem[],
	severity: ObjectiveCheckItem["severity"],
): number {
	return checks.filter((check) => !check.ok && check.severity === severity).length;
}

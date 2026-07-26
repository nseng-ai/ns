import { failure, negative, ok, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import {
	objectiveRecordFrontmatterParseSchema,
	type ObjectiveRecordFrontmatterParse,
} from "../record-frontmatter.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
import { handleObjectiveSlugValidationErrors } from "./slug-validation-errors.ts";
import {
	emptyObjectiveFiles,
	objectiveFilesSchema,
	objectiveMarkdownReadResultSchema,
	objectiveUpdateFileSchema,
	renderFilePresence,
	type ObjectiveFiles,
	type ObjectiveMarkdownReadResult,
	type ObjectiveStorage,
	type ObjectiveUpdateFile,
} from "../storage.ts";
import { resolveObjectiveRecordTarget, targetToEmptyResultFields } from "./objective-target.ts";

export const readObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to read."),
	includeUpdates: z
		.boolean()
		.default(false)
		.describe("Include full update file contents in the output."),
});

export const readObjectiveBaseResultSchema = z.object({
	error: z.string().nullable(),
	rootPath: z.string(),
	rootExists: z.boolean(),
	slug: z.string().nullable(),
	path: z.string().nullable(),
	exists: z.boolean(),
	closed: z.boolean(),
	files: objectiveFilesSchema,
	updates: z.array(objectiveUpdateFileSchema),
	updateCount: z.number().int(),
});

export const readObjectiveNonOkResultSchema = z.discriminatedUnion("status", [
	readObjectiveBaseResultSchema.extend({ status: z.literal("missing-slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("invalid-slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("not-found") }),
]);

export const readObjectiveOkResultSchema = readObjectiveBaseResultSchema.extend({
	status: z.literal("ok"),
	// Record Frontmatter parse of objective.md via the shared reader (ADR 0025).
	// Omitted when the record has no frontmatter (or objective.md is unreadable/missing),
	// so records without frontmatter keep today's output exactly.
	recordFrontmatter: objectiveRecordFrontmatterParseSchema.optional(),
	markdownFiles: z.object({
		objectiveMd: objectiveMarkdownReadResultSchema,
		roadmapMd: objectiveMarkdownReadResultSchema,
		updates: z
			.array(
				z.object({
					update: objectiveUpdateFileSchema,
					content: objectiveMarkdownReadResultSchema,
				}),
			)
			.optional(),
	}),
});

export const readObjectiveResultSchema = z.discriminatedUnion("status", [
	readObjectiveOkResultSchema,
	readObjectiveBaseResultSchema.extend({ status: z.literal("missing-slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("invalid-slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("not-found") }),
]);

export type ReadObjectiveRequest = z.infer<typeof readObjectiveRequestSchema>;
export type ReadObjectiveStatus = "ok" | "missing-slug" | "invalid-slug" | "not-found";
export type ReadObjectiveResult = z.infer<typeof readObjectiveResultSchema>;

export interface ReadObjectiveOptions {
	includeUpdates?: boolean;
}

interface ReadObjectiveMarkdownFiles {
	objectiveMd: ObjectiveMarkdownReadResult;
	roadmapMd: ObjectiveMarkdownReadResult;
	updates?: readonly { update: ObjectiveUpdateFile; content: ObjectiveMarkdownReadResult }[];
}

export interface ReadObjectiveOkResult extends ReadObjectiveBaseResult {
	status: "ok";
	error: null;
	slug: string;
	path: string;
	exists: true;
	/** Omitted when objective.md carries no Record Frontmatter or cannot be read. */
	recordFrontmatter?: ObjectiveRecordFrontmatterParse;
	markdownFiles: ReadObjectiveMarkdownFiles;
}

interface ReadObjectiveBaseResult {
	status: ReadObjectiveStatus;
	error: string | null;
	rootPath: string;
	rootExists: boolean;
	slug: string | null;
	path: string | null;
	exists: boolean;
	closed: boolean;
	files: ObjectiveFiles;
	updates: readonly ObjectiveUpdateFile[];
	updateCount: number;
}

export async function runReadObjective(
	ctx: ObjectiveCliContext,
	request: ReadObjectiveRequest,
): Promise<ClinkrExit<ReadObjectiveResult>> {
	const result = await readObjectiveRecord(ctx.storage, request.slug, {
		includeUpdates: request.includeUpdates,
	});
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	const slugValidationError = handleObjectiveSlugValidationErrors(result.value, request.slug);
	if (slugValidationError !== null) return slugValidationError;
	if (result.value.status === "not-found") {
		return negative(
			`No Objective record found for slug ${pythonStringRepr(result.value.slug ?? "")}.`,
			result.value,
		);
	}
	return ok(result.value);
}

export function renderReadObjective(result: ReadObjectiveResult): string {
	if (result.status !== "ok") return "No Objective record selected.";

	const rootState = result.rootExists ? "present" : "missing";
	const state = result.closed ? "closed" : "open";
	const parts = [
		`# Objective \`${result.slug}\`\n\n`,
		`Root: \`${result.rootPath}\` (${rootState})\n`,
		`Path: \`${result.path}\`\n`,
		`State: ${state}\n`,
		`Files: ${renderFilePresence(result.files)}\n`,
		`Updates: ${result.updateCount}\n\n`,
	];

	appendMarkdownFile(parts, "objective.md", result.markdownFiles.objectiveMd);
	appendMarkdownFile(parts, "roadmap.md", result.markdownFiles.roadmapMd);
	if (!result.files.updatesDir) {
		parts.push("## updates/\n\n_Missing `updates/` directory._\n\n");
	} else if (result.updates.length === 0) {
		parts.push("## updates/\n\n_No direct update Markdown files found._\n\n");
	} else if (result.markdownFiles.updates === undefined) {
		parts.push(renderUpdateInventory(result.updates));
	} else {
		for (const update of result.markdownFiles.updates) {
			appendMarkdownFile(parts, `updates/${update.update.name}`, update.content);
		}
	}
	return removeOneTrailingNewline(parts.join(""));
}

export async function readObjectiveRecord(
	storage: ObjectiveStorage,
	slug: string | undefined,
	options: ReadObjectiveOptions = {},
): Promise<
	| { type: "ok"; value: ReadObjectiveResult }
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
	const facts = {
		status: "ok" as const,
		error: null,
		rootPath: target.rootPath,
		rootExists: target.hasRoot,
		slug: target.slug,
		path: relativePath,
		exists: true,
		closed: files.value.closedMd,
		files: files.value,
		updates: [...updates.value],
		updateCount: updates.value.length,
	};
	const objectiveDocument = await storage.readObjectiveRecordDocument(relativePath);
	// `readObjectiveRecordDocument` carries parsed `document` data for content-shaped readers,
	// but public `objectiveMd` output must not leak that internal document. `objectiveMd.content`
	// intentionally remains the verbatim file text; `document.body` is the frontmatter-stripped
	// content for heading lints and similar readers.
	const objectiveMd: ObjectiveMarkdownReadResult =
		objectiveDocument.type === "ok"
			? { type: "ok", content: objectiveDocument.content }
			: objectiveDocument;
	const recordFrontmatter =
		objectiveDocument.type === "ok" ? objectiveDocument.document.frontmatter : undefined;
	const updateContents =
		options.includeUpdates === true
			? await Promise.all(
					updates.value.map(async (update) => ({
						update,
						content: await storage.readMarkdownFile(`${relativePath}/updates/${update.name}`),
					})),
				)
			: undefined;
	return {
		type: "ok",
		value: {
			...facts,
			...optionalEntry("recordFrontmatter", recordFrontmatter),
			markdownFiles: {
				objectiveMd,
				roadmapMd: await storage.readMarkdownFile(`${relativePath}/roadmap.md`),
				...optionalEntry("updates", updateContents),
			},
		},
	};
}

function emptyResult(options: {
	status: Exclude<ReadObjectiveStatus, "ok">;
	error: string;
	rootPath: string;
	slug: string | null;
	path: string | null;
	hasRoot: boolean;
}): ReadObjectiveResult {
	return {
		status: options.status,
		error: options.error,
		rootPath: options.rootPath,
		rootExists: options.hasRoot,
		slug: options.slug,
		path: options.path,
		exists: false,
		closed: false,
		files: emptyObjectiveFiles(),
		updates: [],
		updateCount: 0,
	};
}

function renderUpdateInventory(updates: readonly ObjectiveUpdateFile[]): string {
	const fileWord = updates.length === 1 ? "file" : "files";
	const pronoun = updates.length === 1 ? "it" : "them";
	return [
		"## updates/\n\n",
		`${updates.length} update ${fileWord} (contents omitted; pass \`--include-updates\` to include ${pronoun}):\n\n`,
		...updates.map((update) => `- \`${update.name}\`\n`),
		"\n",
	].join("");
}

function appendMarkdownFile(
	parts: string[],
	displayPath: string,
	read: ObjectiveMarkdownReadResult,
): void {
	parts.push(`## ${displayPath}\n\n`);
	if (read.type === "missing") {
		parts.push(`_Missing \`${displayPath}\`._\n\n`);
		return;
	}
	if (read.type === "unreadable") {
		parts.push(`_Unable to read \`${displayPath}\`: ${read.message}_\n\n`);
		return;
	}
	parts.push(read.content);
	if (!read.content.endsWith("\n")) parts.push("\n");
	parts.push("\n");
}

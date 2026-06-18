import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { pythonStringRepr, removeOneTrailingNewline } from "./format.ts";
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

export const readObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to read."),
});

export const objectiveFilesSchema = z.object({
	objectiveMd: z.boolean(),
	roadmapMd: z.boolean(),
	updatesDir: z.boolean(),
	closedMd: z.boolean(),
});

export const objectiveUpdateFileSchema = z.object({
	name: z.string(),
	path: z.string(),
});

export const objectiveMarkdownReadResultSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("missing") }),
	z.object({ type: z.literal("ok"), content: z.string() }),
	z.object({ type: z.literal("unreadable"), message: z.string() }),
]);

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
	readObjectiveBaseResultSchema.extend({ status: z.literal("missing_slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("invalid_slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("not_found") }),
]);

export const readObjectiveOkResultSchema = readObjectiveBaseResultSchema.extend({
	status: z.literal("ok"),
	markdownFiles: z.object({
		objectiveMd: objectiveMarkdownReadResultSchema,
		roadmapMd: objectiveMarkdownReadResultSchema,
		updates: z.array(
			z.object({
				update: objectiveUpdateFileSchema,
				content: objectiveMarkdownReadResultSchema,
			}),
		),
	}),
});

export const readObjectiveResultSchema = z.discriminatedUnion("status", [
	readObjectiveOkResultSchema,
	readObjectiveBaseResultSchema.extend({ status: z.literal("missing_slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("invalid_slug") }),
	readObjectiveBaseResultSchema.extend({ status: z.literal("not_found") }),
]);

export type ReadObjectiveRequest = z.infer<typeof readObjectiveRequestSchema>;
export type ReadObjectiveStatus = "ok" | "missing_slug" | "invalid_slug" | "not_found";
export type ReadObjectiveResult = z.infer<typeof readObjectiveResultSchema>;

interface ReadObjectiveMarkdownFiles {
	objectiveMd: ObjectiveMarkdownReadResult;
	roadmapMd: ObjectiveMarkdownReadResult;
	updates: readonly { update: ObjectiveUpdateFile; content: ObjectiveMarkdownReadResult }[];
}

export interface ReadObjectiveOkResult extends ReadObjectiveBaseResult {
	status: "ok";
	error: null;
	slug: string;
	path: string;
	exists: true;
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
	const result = await readObjective(ctx.storage, request.slug);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	const slugValidationError = handleObjectiveSlugValidationErrors(result.value, request.slug);
	if (slugValidationError !== null) return slugValidationError;
	if (result.value.status === "not_found") {
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
	} else if (result.markdownFiles.updates.length === 0) {
		parts.push("## updates/\n\n_No direct update Markdown files found._\n\n");
	} else {
		for (const update of result.markdownFiles.updates) {
			appendMarkdownFile(parts, `updates/${update.update.name}`, update.content);
		}
	}
	return removeOneTrailingNewline(parts.join(""));
}

async function readObjective(
	storage: ObjectiveStorage,
	slug: string | undefined,
): Promise<
	| { type: "ok"; value: ReadObjectiveResult }
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
				root,
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
				root,
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
				root,
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
	const facts = {
		status: "ok" as const,
		error: null,
		rootPath: root,
		rootExists: rootPresence.value,
		slug,
		path: relativePath,
		exists: true,
		closed: files.value.closedMd,
		files: files.value,
		updates: [...updates.value],
		updateCount: updates.value.length,
	};
	return {
		type: "ok",
		value: {
			...facts,
			markdownFiles: {
				objectiveMd: await storage.readMarkdownFile(`${relativePath}/objective.md`),
				roadmapMd: await storage.readMarkdownFile(`${relativePath}/roadmap.md`),
				updates: await Promise.all(
					updates.value.map(async (update) => ({
						update,
						content: await storage.readMarkdownFile(`${relativePath}/updates/${update.name}`),
					})),
				),
			},
		},
	};
}

function emptyResult(options: {
	status: Exclude<ReadObjectiveStatus, "ok">;
	error: string;
	root: string;
	slug: string | null;
	path: string | null;
	hasRoot: boolean;
}): ReadObjectiveResult {
	return {
		status: options.status,
		error: options.error,
		rootPath: options.root,
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

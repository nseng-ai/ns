import { exitCodeForExit, failure, negative, ok, toMachineEnvelope, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
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
	objective_md: z.boolean(),
	roadmap_md: z.boolean(),
	updates_dir: z.boolean(),
	closed_md: z.boolean(),
});

export const objectiveUpdateFileSchema = z.object({
	name: z.string(),
	path: z.string(),
});

export const readObjectiveResultSchema = z.object({
	status: z.enum(["ok", "missing_slug", "invalid_slug", "not_found"]),
	error: z.string().nullable(),
	root_path: z.string(),
	root_exists: z.boolean(),
	slug: z.string().nullable(),
	path: z.string().nullable(),
	exists: z.boolean(),
	closed: z.boolean(),
	files: objectiveFilesSchema,
	updates: z.array(objectiveUpdateFileSchema),
	update_count: z.number().int(),
});

export type ReadObjectiveRequest = z.infer<typeof readObjectiveRequestSchema>;
export type ReadObjectiveStatus = "ok" | "missing_slug" | "invalid_slug" | "not_found";
export type ReadObjectiveResult = z.infer<typeof readObjectiveResultSchema>;

interface ReadObjectiveMarkdownFiles {
	objectiveMd: ObjectiveMarkdownReadResult;
	roadmapMd: ObjectiveMarkdownReadResult;
	updates: readonly { update: ObjectiveUpdateFile; content: ObjectiveMarkdownReadResult }[];
}

export type ReadObjectiveRenderResult = ReadObjectiveResult & {
	markdownFiles: ReadObjectiveMarkdownFiles;
};

export type ReadObjectiveCommandResult = ReadObjectiveResult | ReadObjectiveRenderResult;

export async function runReadObjective(
	ctx: ObjectiveCliContext,
	request: ReadObjectiveRequest,
): Promise<ClinkrExit<ReadObjectiveCommandResult>> {
	const result = await readObjective(ctx.storage, request.slug);
	if (result.type === "storage-error") return failure(result.error.code, result.error.message);
	if (result.value.status === "missing_slug") {
		return negative("Missing Objective slug. Pass an explicit slug.", result.value);
	}
	if (result.value.status === "invalid_slug") {
		return negative(
			`Invalid Objective slug ${pythonStringRepr(request.slug ?? "")}. Pass a single slug, not a path.`,
			result.value,
		);
	}
	if (result.value.status === "not_found") {
		return negative(`No Objective record found for slug ${pythonStringRepr(result.value.slug ?? "")}.`, result.value);
	}
	return ok(result.value);
}

export function renderReadObjective(result: ReadObjectiveCommandResult): string {
	if (!isRenderResult(result) || result.slug === null || result.path === null) return "No Objective record selected.";

	const rootState = result.root_exists ? "present" : "missing";
	const state = result.closed ? "closed" : "open";
	const parts = [
		`# Objective \`${result.slug}\`\n\n`,
		`Root: \`${result.root_path}\` (${rootState})\n`,
		`Path: \`${result.path}\`\n`,
		`State: ${state}\n`,
		`Files: ${renderFilePresence(result.files)}\n`,
		`Updates: ${result.update_count}\n\n`,
	];

	appendMarkdownFile(parts, "objective.md", result.markdownFiles.objectiveMd);
	appendMarkdownFile(parts, "roadmap.md", result.markdownFiles.roadmapMd);
	if (!result.files.updates_dir) {
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

export function legacyReadObjectiveMachine(exit: ClinkrExit<ReadObjectiveCommandResult>): LegacyMachineOutput {
	const stripped = stripRenderFields(exit);
	return { body: toMachineEnvelope(stripped), exitCode: exitCodeForExit(stripped) };
}

async function readObjective(
	storage: ObjectiveStorage,
	slug: string | undefined,
): Promise<{ type: "ok"; value: ReadObjectiveCommandResult } | { type: "storage-error"; error: { code: string; message: string } }> {
	const root = activeRootRelativePath();
	const rootPresence = await storage.activeRootExists();
	if (!rootPresence.ok) return { type: "storage-error", error: rootPresence.error };

	if (slug === undefined) {
		return {
			type: "ok",
			value: emptyResult({ status: "missing_slug", error: "missing_slug", root, slug: null, path: null, hasRoot: rootPresence.value }),
		};
	}

	if (!isValidObjectiveSlug(slug)) {
		return {
			type: "ok",
			value: emptyResult({ status: "invalid_slug", error: "invalid_slug", root, slug: null, path: null, hasRoot: rootPresence.value }),
		};
	}

	const relativePath = activeRecordRelativePath(slug);
	const exists = await storage.activeRecordExists(slug);
	if (!exists.ok) return { type: "storage-error", error: exists.error };
	if (!exists.value) {
		return {
			type: "ok",
			value: emptyResult({ status: "not_found", error: "not_found", root, slug, path: relativePath, hasRoot: rootPresence.value }),
		};
	}

	const files = await storage.filePresence(relativePath);
	if (!files.ok) return { type: "storage-error", error: files.error };
	const updates = await storage.listUpdateFiles(relativePath);
	if (!updates.ok) return { type: "storage-error", error: updates.error };
	const facts: ReadObjectiveResult = {
		status: "ok",
		error: null,
		root_path: root,
		root_exists: rootPresence.value,
		slug,
		path: relativePath,
		exists: true,
		closed: files.value.closed_md,
		files: files.value,
		updates: [...updates.value],
		update_count: updates.value.length,
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
		root_path: options.root,
		root_exists: options.hasRoot,
		slug: options.slug,
		path: options.path,
		exists: false,
		closed: false,
		files: emptyObjectiveFiles(),
		updates: [],
		update_count: 0,
	};
}

function appendMarkdownFile(parts: string[], displayPath: string, read: ObjectiveMarkdownReadResult): void {
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

function isRenderResult(result: ReadObjectiveCommandResult): result is ReadObjectiveRenderResult {
	return "markdownFiles" in result;
}

function stripRenderFields(exit: ClinkrExit<ReadObjectiveCommandResult>): ClinkrExit<ReadObjectiveResult> {
	switch (exit.type) {
		case "ok":
			return ok(factsOnly(exit.data));
		case "negative":
			return exit.data === undefined ? negative(exit.message) : negative(exit.message, factsOnly(exit.data));
		case "failure":
			return exit;
	}
}

function factsOnly(result: ReadObjectiveCommandResult): ReadObjectiveResult {
	return {
		status: result.status,
		error: result.error,
		root_path: result.root_path,
		root_exists: result.root_exists,
		slug: result.slug,
		path: result.path,
		exists: result.exists,
		closed: result.closed,
		files: result.files,
		updates: [...result.updates],
		update_count: result.update_count,
	};
}

function pythonStringRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function removeOneTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}

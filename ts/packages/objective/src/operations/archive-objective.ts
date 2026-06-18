import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../context.ts";
import { pythonStringRepr } from "./format.ts";
import {
	archiveEmptyDestinationRelativePath,
	archiveEmptySourceRelativePath,
	isValidObjectiveSlug,
	type ObjectiveArchiveDirection,
	type ObjectiveStorage,
} from "../storage.ts";

export const archiveObjectiveRequestSchema = z.object({
	slug: z.string().optional().describe("Objective slug to archive or unarchive."),
	unarchive: z.boolean().default(false).describe("Move from archive back to active Objectives."),
});

export const archiveObjectiveResultSchema = z.object({
	status: z.enum([
		"archived",
		"unarchived",
		"missing_slug",
		"invalid_slug",
		"source_not_found",
		"source_not_directory",
		"destination_exists",
	]),
	error: z.string().nullable(),
	slug: z.string().nullable(),
	direction: z.enum(["archive", "unarchive"]),
	sourcePath: z.string(),
	destinationPath: z.string(),
	sourceExists: z.boolean(),
	destinationExists: z.boolean(),
	moved: z.boolean(),
});

export type ArchiveObjectiveRequest = z.infer<typeof archiveObjectiveRequestSchema>;
export type ArchiveObjectiveResult = z.infer<typeof archiveObjectiveResultSchema>;
export type ArchiveObjectiveStatus = ArchiveObjectiveResult["status"];

export async function runArchiveObjective(
	ctx: ObjectiveCliContext,
	request: ArchiveObjectiveRequest,
): Promise<ClinkrExit<ArchiveObjectiveResult>> {
	const result = await archiveObjective(ctx.storage, request);
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
	if (result.value.status === "source_not_found") {
		return negative(
			sourceNotFoundMessage(
				result.value.slug ?? "",
				result.value.direction,
				result.value.sourcePath,
			),
			result.value,
		);
	}
	if (result.value.status === "source_not_directory") {
		return negative(
			`Objective source path for slug ${pythonStringRepr(result.value.slug ?? "")} is not a directory: ${result.value.sourcePath}.`,
			result.value,
		);
	}
	if (result.value.status === "destination_exists") {
		return negative(
			`Destination already exists for slug ${pythonStringRepr(result.value.slug ?? "")}: ${result.value.destinationPath}. Refusing to merge or overwrite.`,
			result.value,
		);
	}
	return ok(result.value);
}

export function renderArchiveObjective(result: ArchiveObjectiveResult): string {
	const action = result.status === "unarchived" ? "Unarchived" : "Archived";
	return `${action} Objective \`${result.slug}\`.\n\nMoved:\n  ${result.sourcePath}\n  -> ${result.destinationPath}`;
}

async function archiveObjective(
	storage: ObjectiveStorage,
	request: ArchiveObjectiveRequest,
): Promise<
	| { type: "ok"; value: ArchiveObjectiveResult }
	| { type: "storage-error"; error: { code: string; message: string } }
> {
	const direction: ObjectiveArchiveDirection = request.unarchive ? "unarchive" : "archive";
	if (request.slug === undefined) {
		return { type: "ok", value: emptyResult("missing_slug", "missing_slug", direction) };
	}
	if (!isValidObjectiveSlug(request.slug)) {
		return { type: "ok", value: emptyResult("invalid_slug", "invalid_slug", direction) };
	}

	const movePaths = storage.movePaths(request.slug, direction);
	const sourceKind = await storage.pathKind(movePaths.relativeSource);
	if (!sourceKind.ok) return { type: "storage-error", error: sourceKind.error };
	const destinationKind = await storage.pathKind(movePaths.relativeDestination);
	if (!destinationKind.ok) return { type: "storage-error", error: destinationKind.error };
	const destinationExists = destinationKind.value !== "missing";

	if (sourceKind.value === "missing") {
		return {
			type: "ok",
			value: archiveResult({
				status: "source_not_found",
				error: "source_not_found",
				slug: request.slug,
				direction,
				sourcePath: movePaths.relativeSource,
				destinationPath: movePaths.relativeDestination,
				hasSource: false,
				hasDestination: destinationExists,
				hasMoved: false,
			}),
		};
	}
	if (sourceKind.value !== "directory") {
		return {
			type: "ok",
			value: archiveResult({
				status: "source_not_directory",
				error: "source_not_directory",
				slug: request.slug,
				direction,
				sourcePath: movePaths.relativeSource,
				destinationPath: movePaths.relativeDestination,
				hasSource: true,
				hasDestination: destinationExists,
				hasMoved: false,
			}),
		};
	}
	if (destinationExists) {
		return {
			type: "ok",
			value: archiveResult({
				status: "destination_exists",
				error: "destination_exists",
				slug: request.slug,
				direction,
				sourcePath: movePaths.relativeSource,
				destinationPath: movePaths.relativeDestination,
				hasSource: true,
				hasDestination: true,
				hasMoved: false,
			}),
		};
	}

	const moved = await storage.moveRecord(movePaths);
	if (!moved.ok) return { type: "storage-error", error: moved.error };
	return {
		type: "ok",
		value: archiveResult({
			status: direction === "unarchive" ? "unarchived" : "archived",
			error: null,
			slug: request.slug,
			direction,
			sourcePath: movePaths.relativeSource,
			destinationPath: movePaths.relativeDestination,
			hasSource: false,
			hasDestination: true,
			hasMoved: true,
		}),
	};
}

function emptyResult(
	status: ArchiveObjectiveStatus,
	error: string,
	direction: ObjectiveArchiveDirection,
): ArchiveObjectiveResult {
	return {
		status,
		error,
		slug: null,
		direction,
		sourcePath: archiveEmptySourceRelativePath(direction),
		destinationPath: archiveEmptyDestinationRelativePath(direction),
		sourceExists: false,
		destinationExists: false,
		moved: false,
	};
}

function archiveResult(options: {
	status: ArchiveObjectiveStatus;
	error: string | null;
	slug: string;
	direction: ObjectiveArchiveDirection;
	sourcePath: string;
	destinationPath: string;
	hasSource: boolean;
	hasDestination: boolean;
	hasMoved: boolean;
}): ArchiveObjectiveResult {
	return {
		status: options.status,
		error: options.error,
		slug: options.slug,
		direction: options.direction,
		sourcePath: options.sourcePath,
		destinationPath: options.destinationPath,
		sourceExists: options.hasSource,
		destinationExists: options.hasDestination,
		moved: options.hasMoved,
	};
}

function sourceNotFoundMessage(
	slug: string,
	direction: ObjectiveArchiveDirection,
	sourcePath: string,
): string {
	const sourceLabel = direction === "unarchive" ? "archived" : "active";
	return `No ${sourceLabel} Objective record found for slug ${pythonStringRepr(slug)} at ${sourcePath}.`;
}

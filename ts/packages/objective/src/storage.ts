import { basename, join } from "node:path";

import { z } from "zod";

export const ACTIVE_OBJECTIVE_ROOT = ".asdl/objectives";
export const OBJECTIVE_ARCHIVE_ROOT = ".asdl/objective-archive";

export type ObjectiveRecordStatus = "open" | "closed";
export type ObjectiveArchiveDirection = "archive" | "unarchive";

export interface ObjectiveFiles {
	objectiveMd: boolean;
	roadmapMd: boolean;
	updatesDir: boolean;
	closedMd: boolean;
}

export const objectiveFilesSchema = z.object({
	objectiveMd: z.boolean(),
	roadmapMd: z.boolean(),
	updatesDir: z.boolean(),
	closedMd: z.boolean(),
});

export interface ObjectiveUpdateFile {
	name: string;
	path: string;
}

export const objectiveUpdateFileSchema = z.object({
	name: z.string(),
	path: z.string(),
});

export interface ObjectiveCheckoutRecord {
	slug: string;
	status: ObjectiveRecordStatus;
}

export interface ObjectiveCheckoutInventory {
	records: readonly ObjectiveCheckoutRecord[];
}

export interface ObjectiveRecordMovePaths {
	relativeSource: string;
	relativeDestination: string;
}

export type ObjectivePathKind = "missing" | "file" | "directory" | "other";

export interface ObjectiveDirectoryEntry {
	name: string;
	kind: ObjectivePathKind;
}

export interface ObjectiveStorageError {
	code: string;
	message: string;
}

export type ObjectiveStorageResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ObjectiveStorageError };

export type ObjectiveMarkdownReadResult =
	| { type: "missing" }
	| { type: "ok"; content: string }
	| { type: "unreadable"; message: string };

export interface ObjectiveStorageGateway {
	pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>>;
	listDirectory(
		relativePath: string,
	): Promise<ObjectiveStorageResult<readonly ObjectiveDirectoryEntry[]>>;
	readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult>;
	moveDirectory(
		sourceRelativePath: string,
		destinationRelativePath: string,
	): Promise<ObjectiveStorageResult<void>>;
}

export class ObjectiveStorage {
	private readonly gateway: ObjectiveStorageGateway;

	constructor(gateway: ObjectiveStorageGateway) {
		this.gateway = gateway;
	}

	async pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>> {
		return await this.gateway.pathKind(relativePath);
	}

	async activeRootExists(): Promise<ObjectiveStorageResult<boolean>> {
		const kind = await this.gateway.pathKind(activeRootRelativePath());
		if (!kind.ok) return kind;
		return { ok: true, value: kind.value !== "missing" };
	}

	async activeRecordExists(slug: string): Promise<ObjectiveStorageResult<boolean>> {
		const kind = await this.gateway.pathKind(activeRecordRelativePath(slug));
		if (!kind.ok) return kind;
		return { ok: true, value: kind.value === "directory" };
	}

	async checkoutInventory(): Promise<ObjectiveStorageResult<ObjectiveCheckoutInventory>> {
		const rootKind = await this.gateway.pathKind(activeRootRelativePath());
		if (!rootKind.ok) return rootKind;
		if (rootKind.value !== "directory") return { ok: true, value: { records: [] } };

		const listed = await this.gateway.listDirectory(activeRootRelativePath());
		if (!listed.ok) return listed;
		const records = await Promise.all(
			listed.value
				.filter((entry) => entry.kind === "directory")
				.sort((left, right) => left.name.localeCompare(right.name))
				.map(async (entry): Promise<ObjectiveStorageResult<ObjectiveCheckoutRecord>> => {
					const closed = await this.gateway.pathKind(
						posixJoin(activeRecordRelativePath(entry.name), "closed.md"),
					);
					if (!closed.ok) return closed;
					return {
						ok: true,
						value: {
							slug: entry.name,
							status: closed.value === "file" ? "closed" : "open",
						},
					};
				}),
		);
		const values: ObjectiveCheckoutRecord[] = [];
		for (const record of records) {
			if (!record.ok) return record;
			values.push(record.value);
		}
		return { ok: true, value: { records: values } };
	}

	async filePresence(recordRelativePath: string): Promise<ObjectiveStorageResult<ObjectiveFiles>> {
		const [objectiveMd, roadmapMd, updatesDir, closedMd] = await Promise.all([
			this.gateway.pathKind(posixJoin(recordRelativePath, "objective.md")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "roadmap.md")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "updates")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "closed.md")),
		]);
		if (!objectiveMd.ok) return objectiveMd;
		if (!roadmapMd.ok) return roadmapMd;
		if (!updatesDir.ok) return updatesDir;
		if (!closedMd.ok) return closedMd;
		return {
			ok: true,
			value: {
				objectiveMd: objectiveMd.value === "file",
				roadmapMd: roadmapMd.value === "file",
				updatesDir: updatesDir.value === "directory",
				closedMd: closedMd.value === "file",
			},
		};
	}

	async activeRecordFilePresence(slug: string): Promise<ObjectiveStorageResult<ObjectiveFiles>> {
		return await this.filePresence(activeRecordRelativePath(slug));
	}

	async listUpdateFiles(
		recordRelativePath: string,
	): Promise<ObjectiveStorageResult<readonly ObjectiveUpdateFile[]>> {
		const updatesRelativePath = posixJoin(recordRelativePath, "updates");
		const updatesKind = await this.gateway.pathKind(updatesRelativePath);
		if (!updatesKind.ok) return updatesKind;
		if (updatesKind.value !== "directory") return { ok: true, value: [] };

		const listed = await this.gateway.listDirectory(updatesRelativePath);
		if (!listed.ok) return listed;
		const relativeUpdatesDir = posixJoin(
			activeRecordRelativePath(basename(recordRelativePath)),
			"updates",
		);
		return {
			ok: true,
			value: listed.value
				.filter((entry) => entry.kind === "file" && entry.name.endsWith(".md"))
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((entry) => ({ name: entry.name, path: posixJoin(relativeUpdatesDir, entry.name) })),
		};
	}

	async readMarkdownFile(relativePath: string): Promise<ObjectiveMarkdownReadResult> {
		return await this.gateway.readTextFile(relativePath);
	}

	movePaths(slug: string, direction: ObjectiveArchiveDirection): ObjectiveRecordMovePaths {
		return {
			relativeSource: archiveSourceRelativePath(slug, direction),
			relativeDestination: archiveDestinationRelativePath(slug, direction),
		};
	}

	async moveRecord(movePaths: ObjectiveRecordMovePaths): Promise<ObjectiveStorageResult<void>> {
		return await this.gateway.moveDirectory(
			movePaths.relativeSource,
			movePaths.relativeDestination,
		);
	}
}

export function isValidObjectiveSlug(slug: string): boolean {
	return (
		slug !== "" && slug !== "." && slug !== ".." && !slug.includes("/") && !slug.includes("\\")
	);
}

export function activeRootRelativePath(): string {
	return ACTIVE_OBJECTIVE_ROOT;
}

export function archiveRootRelativePath(): string {
	return OBJECTIVE_ARCHIVE_ROOT;
}

export function activeRecordRelativePath(slug: string): string {
	return posixJoin(activeRootRelativePath(), slug);
}

export function archivedRecordRelativePath(slug: string): string {
	return posixJoin(archiveRootRelativePath(), slug);
}

export function archiveSourceRelativePath(
	slug: string,
	direction: ObjectiveArchiveDirection,
): string {
	if (direction === "unarchive") return archivedRecordRelativePath(slug);
	return activeRecordRelativePath(slug);
}

export function archiveDestinationRelativePath(
	slug: string,
	direction: ObjectiveArchiveDirection,
): string {
	if (direction === "unarchive") return activeRecordRelativePath(slug);
	return archivedRecordRelativePath(slug);
}

export function archiveEmptySourceRelativePath(direction: ObjectiveArchiveDirection): string {
	if (direction === "unarchive") return archiveRootRelativePath();
	return activeRootRelativePath();
}

export function archiveEmptyDestinationRelativePath(direction: ObjectiveArchiveDirection): string {
	if (direction === "unarchive") return activeRootRelativePath();
	return archiveRootRelativePath();
}

export function emptyObjectiveFiles(): ObjectiveFiles {
	return { objectiveMd: false, roadmapMd: false, updatesDir: false, closedMd: false };
}

export function renderFilePresence(files: ObjectiveFiles): string {
	return [
		`objective.md:${yesNo(files.objectiveMd)}`,
		`roadmap.md:${yesNo(files.roadmapMd)}`,
		`updates/:${yesNo(files.updatesDir)}`,
		`closed.md:${yesNo(files.closedMd)}`,
	].join(", ");
}

export function objectiveSlugFromActivePath(path: string): string | null {
	const prefix = `${activeRootRelativePath()}/`;
	if (!path.startsWith(prefix)) return null;

	const rest = path.slice(prefix.length);
	const separatorIndex = rest.indexOf("/");
	if (separatorIndex < 0) return null;
	const slug = rest.slice(0, separatorIndex);
	const childPath = rest.slice(separatorIndex + 1);
	if (childPath.length === 0 || !isValidObjectiveSlug(slug)) return null;
	return slug;
}

function yesNo(value: boolean): "yes" | "no" {
	return value ? "yes" : "no";
}

function posixJoin(...parts: readonly string[]): string {
	return join(...parts).replaceAll("\\", "/");
}

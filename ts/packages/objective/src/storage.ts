import { basename, join } from "node:path";

export const ACTIVE_OBJECTIVE_ROOT = ".asdl/objectives";
export const OBJECTIVE_ARCHIVE_ROOT = ".asdl/objective-archive";

export type ObjectiveRecordStatus = "open" | "closed";

export interface ObjectiveFiles {
	objective_md: boolean;
	roadmap_md: boolean;
	updates_dir: boolean;
	closed_md: boolean;
}

export interface ObjectiveUpdateFile {
	name: string;
	path: string;
}

export interface ObjectiveCheckoutRecord {
	slug: string;
	status: ObjectiveRecordStatus;
}

export interface ObjectiveCheckoutInventory {
	records: readonly ObjectiveCheckoutRecord[];
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

export type ObjectiveStorageResult<T> = { ok: true; value: T } | { ok: false; error: ObjectiveStorageError };

export type ObjectiveMarkdownReadResult =
	| { type: "missing" }
	| { type: "ok"; content: string }
	| { type: "unreadable"; message: string };

export interface ObjectiveStorageGateway {
	pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>>;
	listDirectory(relativePath: string): Promise<ObjectiveStorageResult<readonly ObjectiveDirectoryEntry[]>>;
	readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult>;
}

export class ObjectiveStorage {
	private readonly gateway: ObjectiveStorageGateway;

	constructor(gateway: ObjectiveStorageGateway) {
		this.gateway = gateway;
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
					const closed = await this.gateway.pathKind(posixJoin(activeRecordRelativePath(entry.name), "closed.md"));
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
				objective_md: objectiveMd.value === "file",
				roadmap_md: roadmapMd.value === "file",
				updates_dir: updatesDir.value === "directory",
				closed_md: closedMd.value === "file",
			},
		};
	}

	async activeRecordFilePresence(slug: string): Promise<ObjectiveStorageResult<ObjectiveFiles>> {
		return await this.filePresence(activeRecordRelativePath(slug));
	}

	async listUpdateFiles(recordRelativePath: string): Promise<ObjectiveStorageResult<readonly ObjectiveUpdateFile[]>> {
		const updatesRelativePath = posixJoin(recordRelativePath, "updates");
		const updatesKind = await this.gateway.pathKind(updatesRelativePath);
		if (!updatesKind.ok) return updatesKind;
		if (updatesKind.value !== "directory") return { ok: true, value: [] };

		const listed = await this.gateway.listDirectory(updatesRelativePath);
		if (!listed.ok) return listed;
		const relativeUpdatesDir = posixJoin(activeRecordRelativePath(basename(recordRelativePath)), "updates");
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
}

export function isValidObjectiveSlug(slug: string): boolean {
	return slug !== "" && slug !== "." && slug !== ".." && !slug.includes("/") && !slug.includes("\\");
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

export function emptyObjectiveFiles(): ObjectiveFiles {
	return { objective_md: false, roadmap_md: false, updates_dir: false, closed_md: false };
}

export function renderFilePresence(files: ObjectiveFiles): string {
	return [
		`objective.md:${yesNo(files.objective_md)}`,
		`roadmap.md:${yesNo(files.roadmap_md)}`,
		`updates/:${yesNo(files.updates_dir)}`,
		`closed.md:${yesNo(files.closed_md)}`,
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

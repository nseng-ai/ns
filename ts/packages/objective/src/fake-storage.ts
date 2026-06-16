import { dirname } from "node:path";

import type {
	ObjectiveDirectoryEntry,
	ObjectiveMarkdownReadResult,
	ObjectivePathKind,
	ObjectiveStorageError,
	ObjectiveStorageGateway,
	ObjectiveStorageResult,
} from "./storage.ts";

export interface FakeObjectiveRecordOptions {
	slug: string;
	objectiveMd?: string | null | undefined;
	roadmapMd?: string | null | undefined;
	updates?: Readonly<Record<string, string>> | undefined;
	isClosed?: boolean | undefined;
}

export interface FakeObjectiveStorageGatewayOptions {
	files?: Readonly<Record<string, string>> | undefined;
	directories?: readonly string[] | undefined;
	records?: readonly FakeObjectiveRecordOptions[] | undefined;
	failures?: Readonly<Record<string, ObjectiveStorageError>> | undefined;
	unreadableFiles?: Readonly<Record<string, string>> | undefined;
}

export class FakeObjectiveStorageGateway implements ObjectiveStorageGateway {
	private readonly files = new Map<string, string>();
	private readonly directories = new Set<string>();
	private readonly failures: ReadonlyMap<string, ObjectiveStorageError>;
	private readonly unreadableFiles: ReadonlyMap<string, string>;

	constructor(options: FakeObjectiveStorageGatewayOptions = {}) {
		this.failures = new Map(Object.entries(options.failures ?? {}).map(([path, error]) => [normalizeRelativePath(path), { ...error }]));
		this.unreadableFiles = new Map(Object.entries(options.unreadableFiles ?? {}).map(([path, message]) => [normalizeRelativePath(path), message]));
		this.addDirectory(".");
		for (const directory of options.directories ?? []) {
			this.addDirectory(directory);
		}
		for (const record of options.records ?? []) {
			this.addObjectiveRecord(record);
		}
		for (const [path, content] of Object.entries(options.files ?? {})) {
			this.addFile(path, content);
		}
	}

	async pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>> {
		const path = normalizeRelativePath(relativePath);
		const failure = this.failures.get(path);
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		if (this.files.has(path)) return { ok: true, value: "file" };
		if (this.directories.has(path)) return { ok: true, value: "directory" };
		return { ok: true, value: "missing" };
	}

	async listDirectory(relativePath: string): Promise<ObjectiveStorageResult<readonly ObjectiveDirectoryEntry[]>> {
		const path = normalizeRelativePath(relativePath);
		const failure = this.failures.get(path);
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		if (!this.directories.has(path)) return { ok: true, value: [] };

		const entries = new Map<string, ObjectivePathKind>();
		for (const directory of this.directories) {
			if (directory === path) continue;
			const child = directChildName(path, directory);
			if (child !== null) entries.set(child, "directory");
		}
		for (const file of this.files.keys()) {
			const child = directChildName(path, file);
			if (child !== null && !entries.has(child)) entries.set(child, "file");
		}
		return {
			ok: true,
			value: [...entries.entries()]
				.map(([name, kind]) => ({ name, kind }))
				.sort((left, right) => left.name.localeCompare(right.name)),
		};
	}

	async readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult> {
		const path = normalizeRelativePath(relativePath);
		const unreadable = this.unreadableFiles.get(path);
		if (unreadable !== undefined) return { type: "unreadable", message: unreadable };
		const content = this.files.get(path);
		if (content === undefined) return { type: "missing" };
		return { type: "ok", content };
	}

	async moveDirectory(sourceRelativePath: string, destinationRelativePath: string): Promise<ObjectiveStorageResult<void>> {
		const source = normalizeRelativePath(sourceRelativePath);
		const destination = normalizeRelativePath(destinationRelativePath);
		const sourceFailure = this.failures.get(source);
		if (sourceFailure !== undefined) return { ok: false, error: { ...sourceFailure } };
		const destinationFailure = this.failures.get(destination);
		if (destinationFailure !== undefined) return { ok: false, error: { ...destinationFailure } };
		if (!this.directories.has(source)) {
			return { ok: false, error: { code: "move-source-not-directory", message: `${source} is not a directory.` } };
		}
		if (this.files.has(destination) || this.directories.has(destination)) {
			return { ok: false, error: { code: "move-destination-exists", message: `${destination} already exists.` } };
		}

		this.addDirectory(dirname(destination));
		const directoryMoves = [...this.directories]
			.filter((directory) => isSelfOrDescendant(source, directory))
			.map((directory) => ({ from: directory, to: replacePathPrefix(directory, source, destination) }));
		const fileMoves = [...this.files.entries()]
			.filter(([path]) => isSelfOrDescendant(source, path))
			.map(([path, content]) => ({ from: path, to: replacePathPrefix(path, source, destination), content }));

		for (const move of directoryMoves) {
			this.directories.delete(move.from);
		}
		for (const move of fileMoves) {
			this.files.delete(move.from);
		}
		for (const move of directoryMoves) {
			this.directories.add(move.to);
		}
		for (const move of fileMoves) {
			this.files.set(move.to, move.content);
		}
		return { ok: true, value: undefined };
	}

	addObjectiveRecord(record: FakeObjectiveRecordOptions): void {
		const root = `.asdl/objectives/${record.slug}`;
		this.addDirectory(root);
		if (record.objectiveMd !== null) this.addFile(`${root}/objective.md`, record.objectiveMd ?? `# ${record.slug}\n`);
		if (record.roadmapMd !== null) this.addFile(`${root}/roadmap.md`, record.roadmapMd ?? "# Roadmap\n");
		this.addDirectory(`${root}/updates`);
		for (const [name, content] of Object.entries(record.updates ?? {})) {
			this.addFile(`${root}/updates/${name}`, content);
		}
		if (record.isClosed === true) this.addFile(`${root}/closed.md`, "closed\n");
	}

	addDirectory(path: string): void {
		const normalized = normalizeRelativePath(path);
		if (normalized === "") return;
		const parent = normalizeRelativePath(dirname(normalized));
		if (parent !== "." && parent !== normalized) this.addDirectory(parent);
		this.directories.add(normalized);
	}

	addFile(path: string, content: string): void {
		const normalized = normalizeRelativePath(path);
		this.addDirectory(dirname(normalized));
		this.files.set(normalized, content);
	}
}

function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/\/+$|^\.\//g, "") || ".";
}

function directChildName(parent: string, childPath: string): string | null {
	const normalizedParent = normalizeRelativePath(parent);
	const normalizedChild = normalizeRelativePath(childPath);
	const prefix = normalizedParent === "." ? "" : `${normalizedParent}/`;
	if (!normalizedChild.startsWith(prefix)) return null;
	const rest = normalizedChild.slice(prefix.length);
	if (rest.length === 0 || rest.includes("/")) return null;
	return rest;
}

function isSelfOrDescendant(parent: string, childPath: string): boolean {
	return childPath === parent || childPath.startsWith(`${parent}/`);
}

function replacePathPrefix(path: string, source: string, destination: string): string {
	if (path === source) return destination;
	return `${destination}${path.slice(source.length)}`;
}

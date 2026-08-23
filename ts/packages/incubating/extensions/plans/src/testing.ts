import { dirname, resolve } from "node:path";

import type {
	PlanStoreDirectoryEntry,
	PlanStoreDirectoryRead,
	PlanStoreGateway,
	PlanStorePathStat,
	PlanStorePathType,
} from "./plan-store-gateway.ts";

interface InMemoryNode {
	type: PlanStorePathType;
	content?: Uint8Array;
	mtimeMs: number;
}

export interface WriteInMemoryPlanStoreFileOptions {
	mtimeMs?: number;
}

export class InMemoryPlanStoreGateway implements PlanStoreGateway {
	private readonly nodes = new Map<string, InMemoryNode>();
	private nextMtimeMs = 1;

	constructor(paths: { directories?: readonly string[]; files?: Record<string, string> } = {}) {
		for (const directory of paths.directories ?? []) this.mkdir(directory);
		for (const [path, content] of Object.entries(paths.files ?? {})) this.writeFile(path, content);
	}

	async listDirectory(path: string): Promise<PlanStoreDirectoryRead> {
		const normalizedPath = normalize(path);
		const node = this.nodes.get(normalizedPath);
		if (node === undefined) return { type: "missing" };
		if (node.type !== "directory") return { type: "present", entries: [] };
		const entries = new Map<string, PlanStoreDirectoryEntry>();
		const prefix = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
		for (const [candidatePath, candidate] of this.nodes) {
			if (candidatePath === normalizedPath || !candidatePath.startsWith(prefix)) continue;
			const rest = candidatePath.slice(prefix.length);
			if (rest.length === 0 || rest.includes("/")) continue;
			entries.set(rest, { name: rest, type: candidate.type });
		}
		return {
			type: "present",
			entries: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)),
		};
	}

	async statPath(path: string): Promise<PlanStorePathStat | undefined> {
		const node = this.nodes.get(normalize(path));
		return node === undefined ? undefined : { type: node.type, mtimeMs: node.mtimeMs };
	}

	async readTextFile(path: string): Promise<string> {
		return new TextDecoder().decode(await this.readRegularFileBytes(path));
	}

	async readRegularFileBytes(path: string): Promise<Uint8Array> {
		return this.readBytes(path);
	}

	async writeBytesExclusive(path: string, content: Uint8Array): Promise<void> {
		const normalizedPath = normalize(path);
		if (this.nodes.has(normalizedPath)) {
			throw new Error(
				`Saved plan file already exists in the local plan store; refusing to overwrite.\nPath: ${normalizedPath}`,
			);
		}
		this.writeBytes(normalizedPath, content);
	}

	async removeFile(path: string): Promise<void> {
		const normalizedPath = normalize(path);
		const node = this.nodes.get(normalizedPath);
		if (node?.type !== "file") {
			throw new Error(`In-memory plan store file does not exist: ${normalizedPath}`);
		}
		this.nodes.delete(normalizedPath);
	}

	async realpathOrResolve(path: string): Promise<string> {
		return normalize(path);
	}

	mkdir(path: string, options: { mtimeMs?: number } = {}): void {
		const normalizedPath = normalize(path);
		this.ensureParentDirectories(normalizedPath);
		this.nodes.set(normalizedPath, {
			type: "directory",
			mtimeMs: options.mtimeMs ?? this.nextMtime(),
		});
	}

	writeFile(path: string, content: string, options: WriteInMemoryPlanStoreFileOptions = {}): void {
		this.writeBytes(path, new TextEncoder().encode(content), options);
	}

	writeBytes(
		path: string,
		content: Uint8Array,
		options: WriteInMemoryPlanStoreFileOptions = {},
	): void {
		const normalizedPath = normalize(path);
		this.ensureParentDirectories(normalizedPath);
		this.nodes.set(normalizedPath, {
			type: "file",
			content: content.slice(),
			mtimeMs: options.mtimeMs ?? this.nextMtime(),
		});
	}

	readFile(path: string): string {
		return new TextDecoder().decode(this.readBytes(path));
	}

	readBytes(path: string): Uint8Array {
		const normalizedPath = normalize(path);
		const node = this.nodes.get(normalizedPath);
		if (node?.type !== "file" || node.content === undefined) {
			throw new Error(`In-memory plan store file does not exist: ${normalizedPath}`);
		}
		return node.content.slice();
	}

	hasFile(path: string): boolean {
		return this.nodes.get(normalize(path))?.type === "file";
	}

	private ensureParentDirectories(path: string): void {
		const parent = normalize(dirname(path));
		if (parent === path) return;
		if (!this.nodes.has(parent)) {
			this.ensureParentDirectories(parent);
			this.nodes.set(parent, { type: "directory", mtimeMs: this.nextMtime() });
		}
	}

	private nextMtime(): number {
		const value = this.nextMtimeMs;
		this.nextMtimeMs += 1;
		return value;
	}
}

function normalize(path: string): string {
	return resolve("/", path);
}

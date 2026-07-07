import { join } from "node:path";

import type {
	HarnessArtifactFileSystemGateway,
	HarnessArtifactModuleDiscoveryGateway,
	ModuleDiscoveryDirectoryEntry,
	ModuleDiscoveryPathState,
} from "../../src/index.ts";

export type InMemoryHarnessFsNode =
	| { type: "file"; bytes: Uint8Array }
	| { type: "directory" }
	| { type: "other" };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class InMemoryHarnessFs
	implements HarnessArtifactFileSystemGateway, HarnessArtifactModuleDiscoveryGateway
{
	readonly nodes: Map<string, InMemoryHarnessFsNode>;
	readonly writtenFiles: string[] = [];

	constructor(files: Record<string, string | InMemoryHarnessFsNode>) {
		this.nodes = new Map();
		for (const [path, value] of Object.entries(files)) {
			this.nodes.set(
				path,
				typeof value === "string" ? { type: "file", bytes: textEncoder.encode(value) } : value,
			);
			this.ensureParentDirectories(path);
		}
	}

	async listFiles(rootPath: string) {
		const prefix = `${rootPath}/`;
		const paths = [...this.nodes.entries()]
			.filter(([path, node]) => path.startsWith(prefix) && node.type === "file")
			.map(([path]) => path.slice(prefix.length))
			.sort((left, right) => left.localeCompare(right));
		return { ok: true as const, value: paths };
	}

	async readOptionalFile(path: string) {
		const node = this.nodes.get(path);
		if (node?.type === "file") {
			return { ok: true as const, value: { type: "file" as const, bytes: node.bytes } };
		}
		return { ok: true as const, value: { type: "missing" as const } };
	}

	async writeFile(path: string, bytes: Uint8Array) {
		this.writeBytes(path, bytes);
		return { ok: true as const, value: undefined };
	}

	async readOptionalTextFile(path: string) {
		const node = this.nodes.get(path);
		if (node?.type === "file") {
			return {
				ok: true as const,
				value: { type: "file" as const, text: textDecoder.decode(node.bytes) },
			};
		}
		return { ok: true as const, value: { type: "missing" as const } };
	}

	async writeTextFile(path: string, text: string) {
		this.writeBytes(path, textEncoder.encode(text));
		return { ok: true as const, value: undefined };
	}

	async readDirectory(path: string) {
		const node = this.nodes.get(path);
		if (node === undefined) return { ok: true as const, value: { type: "missing" as const } };
		if (node.type !== "directory") return { ok: true as const, value: { type: "file" as const } };
		return {
			ok: true as const,
			value: { type: "directory" as const, entries: this.directoryEntries(path) },
		};
	}

	async pathState(path: string) {
		const node = this.nodes.get(path);
		if (node === undefined) return { ok: true as const, value: { type: "missing" as const } };
		return { ok: true as const, value: { type: node.type } satisfies ModuleDiscoveryPathState };
	}

	setFile(path: string, text: string): void {
		this.nodes.set(path, { type: "file", bytes: textEncoder.encode(text) });
		this.ensureParentDirectories(path);
	}

	readBytes(path: string): Uint8Array | undefined {
		const node = this.nodes.get(path);
		return node?.type === "file" ? node.bytes : undefined;
	}

	readText(path: string): string | undefined {
		const bytes = this.readBytes(path);
		return bytes === undefined ? undefined : textDecoder.decode(bytes);
	}

	clearWrittenFiles(): void {
		this.writtenFiles.length = 0;
	}

	private writeBytes(path: string, bytes: Uint8Array): void {
		this.nodes.set(path, { type: "file", bytes });
		this.ensureParentDirectories(path);
		this.writtenFiles.push(path);
	}

	private ensureParentDirectories(path: string): void {
		let current = path;
		while (current !== "/") {
			current = current.slice(0, current.lastIndexOf("/")) || "/";
			if (!this.nodes.has(current)) this.nodes.set(current, { type: "directory" });
		}
	}

	private directoryEntries(path: string): readonly ModuleDiscoveryDirectoryEntry[] {
		const prefix = path === "/" ? "/" : `${path}/`;
		const names = new Set<string>();
		for (const nodePath of this.nodes.keys()) {
			if (!nodePath.startsWith(prefix) || nodePath === path) continue;
			const name = nodePath.slice(prefix.length).split("/")[0];
			if (name !== undefined && name !== "") names.add(name);
		}
		return [...names]
			.sort((left, right) => left.localeCompare(right))
			.map((name) => {
				const child = this.nodes.get(join(path, name));
				return { name, type: childType(child) };
			});
	}
}

function childType(node: InMemoryHarnessFsNode | undefined): ModuleDiscoveryDirectoryEntry["type"] {
	if (node?.type === "directory") return "directory";
	if (node?.type === "file") return "file";
	return "other";
}

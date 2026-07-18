import type {
	ProjectConfigPathExistsResult,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";

import type { ProvisionPathKind, SlotProvisionFilesGateway } from "../provision-files.ts";

export interface FakeProvisionFileEntry {
	content: string;
	mode?: number;
	kind?: Exclude<ProvisionPathKind, "missing">;
}

export interface FakeSlotProvisionFilesGatewayOptions {
	/** Absolute path -> file entry (string shorthand for a plain file). */
	files?: Record<string, string | FakeProvisionFileEntry>;
	/** Absolute config path -> source. Missing path means the config file is absent. */
	projectConfigByPath?: Record<string, string>;
	/** Absolute config path -> read failure message. */
	projectConfigReadFailuresByPath?: Record<string, string>;
	/** Destination absolute path -> error message thrown on copy. */
	copyFailures?: Record<string, string>;
}

export interface FakeProvisionFilesOperation {
	type: "copy-into-worktree" | "copy-into-store";
	from: string;
	to: string;
}

export class FakeSlotProvisionFilesGateway implements SlotProvisionFilesGateway {
	private readonly entries: Map<string, FakeProvisionFileEntry>;
	private readonly projectConfigByPath: Map<string, string>;
	private readonly projectConfigReadFailuresByPath: Map<string, string>;
	private readonly copyFailures: Map<string, string>;
	private readonly log: FakeProvisionFilesOperation[] = [];

	constructor(options: FakeSlotProvisionFilesGatewayOptions = {}) {
		this.entries = new Map(
			Object.entries(options.files ?? {}).map(([path, entry]) => [
				path,
				typeof entry === "string" ? { content: entry } : { ...entry },
			]),
		);
		this.projectConfigByPath = new Map(Object.entries(options.projectConfigByPath ?? {}));
		this.projectConfigReadFailuresByPath = new Map(
			Object.entries(options.projectConfigReadFailuresByPath ?? {}),
		);
		this.copyFailures = new Map(Object.entries(options.copyFailures ?? {}));
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		const path = projectConfigPath(request);
		const failureMessage = this.projectConfigReadFailuresByPath.get(path);
		if (failureMessage !== undefined) return { type: "error", message: failureMessage };
		const text = this.projectConfigByPath.get(path);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(request: { repoRoot: string; relativePath: string }): ProjectConfigPathExistsResult {
		return this.projectConfigByPath.has(projectConfigPath(request))
			? { type: "present" }
			: { type: "missing" };
	}

	async inspect(absolutePath: string): Promise<ProvisionPathKind> {
		const entry = this.entries.get(absolutePath);
		if (entry === undefined) return "missing";
		return entry.kind ?? "file";
	}

	async contentsEqual(leftPath: string, rightPath: string): Promise<boolean> {
		return this.requireFile(leftPath).content === this.requireFile(rightPath).content;
	}

	async copyIntoWorktree(storeFilePath: string, worktreeFilePath: string): Promise<void> {
		this.log.push({ type: "copy-into-worktree", from: storeFilePath, to: worktreeFilePath });
		this.copy(storeFilePath, worktreeFilePath);
	}

	async copyIntoStore(worktreeFilePath: string, storeFilePath: string): Promise<void> {
		this.log.push({ type: "copy-into-store", from: worktreeFilePath, to: storeFilePath });
		this.copy(worktreeFilePath, storeFilePath);
	}

	operations(): readonly FakeProvisionFilesOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}

	fileAt(absolutePath: string): FakeProvisionFileEntry | null {
		const entry = this.entries.get(absolutePath);
		return entry === undefined ? null : { ...entry };
	}

	private copy(fromPath: string, toPath: string): void {
		const failureMessage = this.copyFailures.get(toPath);
		if (failureMessage !== undefined) throw new Error(failureMessage);
		const source = this.requireFile(fromPath);
		this.entries.set(toPath, {
			content: source.content,
			...(source.mode === undefined ? {} : { mode: source.mode }),
		});
	}

	private requireFile(absolutePath: string): FakeProvisionFileEntry {
		const entry = this.entries.get(absolutePath);
		if (entry === undefined || (entry.kind ?? "file") !== "file") {
			throw new Error(`Fake provision file missing or not a file: ${absolutePath}`);
		}
		return entry;
	}
}

function projectConfigPath(request: { repoRoot: string; relativePath: string }): string {
	return `${request.repoRoot}/${request.relativePath}`;
}

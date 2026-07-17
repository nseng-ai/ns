import type { ProvisionPathKind, SlotProvisionFilesGateway } from "../provision-files.ts";

export interface FakeProvisionFileEntry {
	content: string;
	mode?: number;
	kind?: Exclude<ProvisionPathKind, "missing">;
}

export interface FakeSlotProvisionFilesGatewayOptions {
	/** Absolute path -> file entry (string shorthand for a plain file). */
	files?: Record<string, string | FakeProvisionFileEntry>;
	/** Invoking repo root -> ns.toml source. Missing root means no ns.toml. */
	projectConfigByRoot?: Record<string, string>;
	/** Invoking repo root -> error message thrown when reading ns.toml. */
	projectConfigReadFailures?: Record<string, string>;
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
	private readonly projectConfigByRoot: Map<string, string>;
	private readonly projectConfigReadFailures: Map<string, string>;
	private readonly copyFailures: Map<string, string>;
	private readonly log: FakeProvisionFilesOperation[] = [];

	constructor(options: FakeSlotProvisionFilesGatewayOptions = {}) {
		this.entries = new Map(
			Object.entries(options.files ?? {}).map(([path, entry]) => [
				path,
				typeof entry === "string" ? { content: entry } : { ...entry },
			]),
		);
		this.projectConfigByRoot = new Map(Object.entries(options.projectConfigByRoot ?? {}));
		this.projectConfigReadFailures = new Map(
			Object.entries(options.projectConfigReadFailures ?? {}),
		);
		this.copyFailures = new Map(Object.entries(options.copyFailures ?? {}));
	}

	async readProjectConfigSource(repoRoot: string): Promise<string | null> {
		const failureMessage = this.projectConfigReadFailures.get(repoRoot);
		if (failureMessage !== undefined) throw new Error(failureMessage);
		return this.projectConfigByRoot.get(repoRoot) ?? null;
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

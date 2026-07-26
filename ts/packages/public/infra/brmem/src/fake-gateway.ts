import {
	brmemError,
	brmemFound,
	brmemMissing,
	brmemOk,
	brmemOptionalError,
	type BrmemResult,
} from "./contracts.ts";
import { keyBranchFilter } from "./entry-filters.ts";
import type {
	BrmemGateway,
	CopyEntriesResult,
	DeleteEntryResult,
	EntryContent,
	EntryDiagnostic,
	EntryQueryOptions,
	EntryWriteOptions,
	ListedEntry,
	ListEntriesOptions,
	ListedSnapshot,
	ListSnapshotsOptions,
	PutEntryResult,
} from "./gateway.ts";
import { keyGlobMatches } from "./key-glob.ts";
import {
	compareEntries,
	mustEntryRef,
	mustSnapshotRef,
	type EntryCoordinate,
} from "./ref-layout.ts";
import { normalizeBrmemTimestamp } from "./timestamps.ts";

export interface FakeEntrySeed {
	namespace: string;
	branch: string;
	key: string;
	content: string;
	headSha?: string;
	headDate?: string;
	blobSha?: string;
	updatedAt?: string;
}

export interface FakeGitRemoteConfig {
	push: readonly string[];
	fetch: readonly string[];
}

export interface FakeBrmemGatewayOptions {
	currentBranch?: string | { type: "detached" } | { type: "error"; code: string; message: string };
	entries?: readonly FakeEntrySeed[];
	remotes?: Record<string, FakeGitRemoteConfig>;
	localBranches?: readonly string[];
	operationErrors?: Partial<
		Record<
			| "list"
			| "get"
			| "check"
			| "put"
			| "create"
			| "delete"
			| "copy"
			| "listSnapshots"
			| "deleteSnapshot"
			| "listLocalBranches"
			| "localBranchPresence"
			| "remoteConfig"
			| "addRefspecs",
			{ code: string; message: string }
		>
	>;
}

interface StoredEntry {
	content: string;
	headSha: string;
	headDate: string;
	blobSha: string;
	updatedAt: string;
}

interface SnapshotState {
	commitSha: string;
	entries: Map<string, StoredEntry>;
}

const FAKE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export class FakeBrmemGateway implements BrmemGateway {
	private readonly branchState: FakeBrmemGatewayOptions["currentBranch"];
	private readonly operationErrors: NonNullable<FakeBrmemGatewayOptions["operationErrors"]>;
	private readonly snapshots: Map<string, SnapshotState>;
	private readonly snapshotsByCommit: Map<string, SnapshotState>;
	private readonly localBranches: Set<string>;
	private readonly remotes: Map<string, import("./gateway.ts").GitRemoteConfig>;
	private sequence: number;
	private timestampSequence: number;

	constructor(options: FakeBrmemGatewayOptions = {}) {
		this.branchState = options.currentBranch ?? "main";
		this.operationErrors = { ...options.operationErrors };
		this.snapshots = new Map();
		this.snapshotsByCommit = new Map();
		this.localBranches = new Set(
			options.localBranches ?? deriveLocalBranches(options.currentBranch, options.entries ?? []),
		);
		this.remotes = new Map(
			Object.entries(
				options.remotes ?? { origin: { push: [], fetch: ["+refs/heads/*:refs/remotes/origin/*"] } },
			).map(([k, v]) => [k, { push: [...v.push], fetch: [...v.fetch] }]),
		);
		this.sequence = 1;
		this.timestampSequence = 1;
		for (const entry of options.entries ?? []) this.seedEntry(entry);
	}

	async currentBranch() {
		if (typeof this.branchState === "string") return brmemOk(this.branchState);
		if (this.branchState?.type === "error")
			return brmemError(this.branchState.code, this.branchState.message);
		return brmemError("detached-head", "Could not resolve current branch; HEAD appears detached.");
	}

	async listEntries(options: ListEntriesOptions) {
		const error = this.operationErrors.list;
		if (error !== undefined) return brmemError<readonly ListedEntry[]>(error.code, error.message);
		return brmemOk(
			this.collectEntries({
				allNamespaces: false,
				namespace: options.namespace,
				...keyBranchFilter(options),
			}),
		);
	}

	async listAllEntries(options: { key?: string; branch?: string }) {
		const error = this.operationErrors.list;
		if (error !== undefined) return brmemError<readonly ListedEntry[]>(error.code, error.message);
		return brmemOk(
			this.collectEntries({
				allNamespaces: true,
				...keyBranchFilter(options),
			}),
		);
	}

	async getEntry(options: EntryQueryOptions) {
		const error = this.operationErrors.get;
		if (error !== undefined) return brmemOptionalError<EntryContent>(error.code, error.message);
		const stored = this.resolveSnapshot(snapshotLookup(options))?.entries.get(options.key);
		if (stored === undefined) return brmemMissing<EntryContent>();
		return brmemFound({ content: stored.content });
	}

	async checkEntry(options: EntryQueryOptions) {
		const error = this.operationErrors.check;
		if (error !== undefined) return brmemOptionalError<EntryDiagnostic>(error.code, error.message);
		const stored = this.resolveSnapshot(snapshotLookup(options))?.entries.get(options.key);
		if (stored === undefined) return brmemMissing<EntryDiagnostic>();
		return brmemFound({
			headSha: stored.headSha,
			headDate: stored.headDate,
			blobSha: stored.blobSha,
			sizeBytes: Buffer.byteLength(stored.content, "utf8"),
		});
	}

	async putEntry(options: EntryWriteOptions) {
		const error = this.operationErrors.put;
		if (error !== undefined) return brmemError<PutEntryResult>(error.code, error.message);
		return this.writeEntry(options);
	}

	async createEntry(options: EntryWriteOptions) {
		const error = this.operationErrors.create;
		if (error !== undefined) return brmemError<PutEntryResult>(error.code, error.message);
		const snapshot = this.ensureSnapshot(options.namespace, options.branch);
		if (snapshot.entries.has(options.key)) {
			return brmemError<PutEntryResult>(
				"key-already-exists",
				`key ${JSON.stringify(options.key)} already exists`,
			);
		}
		return this.writeEntry(options);
	}

	async deleteEntry(options: EntryCoordinate) {
		const error = this.operationErrors.delete;
		if (error !== undefined) return brmemError<DeleteEntryResult>(error.code, error.message);
		const snapshot = this.snapshots.get(snapshotId(options.namespace, options.branch));
		if (snapshot === undefined || !snapshot.entries.has(options.key)) {
			return brmemError("key-not-found", `key ${JSON.stringify(options.key)} not found`);
		}
		snapshot.entries.delete(options.key);
		const commitSha = this.nextSha("commit");
		snapshot.commitSha = commitSha;
		this.recordSnapshot(commitSha, snapshot);
		return brmemOk({
			commitSha,
			entry: mustEntryRef(options.namespace, options.key, options.branch),
			isSnapshotEmpty: snapshot.entries.size === 0,
		});
	}

	async copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string;
	}) {
		const error = this.operationErrors.copy;
		if (error !== undefined) return brmemError<CopyEntriesResult>(error.code, error.message);
		const source = this.snapshots.get(snapshotId(options.namespace, options.fromBranch));
		if (source === undefined) return brmemOk({ entries: [] });
		const dest = this.ensureSnapshot(options.namespace, options.toBranch);
		const sourcePairs = [...source.entries.entries()].filter(([key]) =>
			options.keyGlob === undefined ? true : keyGlobMatches(key, options.keyGlob),
		);
		if (sourcePairs.length === 0) return brmemOk({ entries: [] });
		const conflicts = [...dest.entries.keys()].filter((key) =>
			options.keyGlob === undefined ? true : keyGlobMatches(key, options.keyGlob),
		);
		if (conflicts.length > 0 && !options.shouldOverwrite) {
			return brmemError(
				"copy-conflict",
				`destination has conflicting entries: ${conflicts.sort().join(", ")}`,
			);
		}
		if (options.keyGlob === undefined) dest.entries.clear();
		else {
			for (const key of Array.from(dest.entries.keys())) {
				if (keyGlobMatches(key, options.keyGlob)) dest.entries.delete(key);
			}
		}
		for (const [key, value] of sourcePairs) dest.entries.set(key, { ...value });
		dest.commitSha = this.nextSha("commit");
		this.recordSnapshot(dest.commitSha, dest);
		return brmemOk({
			entries: sourcePairs
				.map(([key]) => mustEntryRef(options.namespace, key, options.toBranch))
				.sort(compareEntries),
		});
	}

	private writeEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): BrmemResult<PutEntryResult> {
		const snapshot = this.ensureSnapshot(options.namespace, options.branch);
		const commitSha = this.nextSha("commit");
		const updatedAt = this.nextTimestamp();
		snapshot.commitSha = commitSha;
		snapshot.entries.set(options.key, {
			content: options.content,
			headSha: commitSha,
			headDate: updatedAt,
			blobSha: this.nextSha("blob"),
			updatedAt,
		});
		this.recordSnapshot(commitSha, snapshot);
		return brmemOk({
			commitSha,
			entry: mustEntryRef(options.namespace, options.key, options.branch),
		});
	}

	private seedEntry(seed: FakeEntrySeed): void {
		const snapshot = this.ensureSnapshot(seed.namespace, seed.branch);
		const commitSha = seed.headSha ?? this.nextSha("commit");
		const updatedAt = normalizeBrmemTimestamp(
			seed.updatedAt ?? seed.headDate ?? this.nextTimestamp(),
		);
		const headDate = normalizeBrmemTimestamp(seed.headDate ?? updatedAt);
		snapshot.commitSha = commitSha;
		snapshot.entries.set(seed.key, {
			content: seed.content,
			headSha: commitSha,
			headDate,
			blobSha: seed.blobSha ?? this.nextSha("blob"),
			updatedAt,
		});
		this.recordSnapshot(commitSha, snapshot);
	}

	private ensureSnapshot(namespace: string, branch: string): SnapshotState {
		const id = snapshotId(namespace, branch);
		const existing = this.snapshots.get(id);
		if (existing !== undefined) return existing;
		const created: SnapshotState = { commitSha: this.nextSha("commit"), entries: new Map() };
		this.snapshots.set(id, created);
		return created;
	}

	private resolveSnapshot(options: {
		namespace: string;
		branch: string;
		at?: string;
	}): SnapshotState | undefined {
		if (options.at !== undefined) return this.snapshotsByCommit.get(options.at);
		return this.snapshots.get(snapshotId(options.namespace, options.branch));
	}

	private recordSnapshot(commitSha: string, snapshot: SnapshotState): void {
		this.snapshotsByCommit.set(commitSha, cloneSnapshot(snapshot));
	}

	private collectEntries(options: {
		allNamespaces: boolean;
		namespace?: string;
		key?: string;
		branch?: string;
	}): readonly ListedEntry[] {
		const entries: ListedEntry[] = [];
		for (const [id, snapshot] of this.snapshots) {
			const parsed = parseSnapshotId(id);
			if (!options.allNamespaces && parsed.namespace !== options.namespace) continue;
			if (options.branch !== undefined && parsed.branch !== options.branch) continue;
			for (const [key, stored] of snapshot.entries) {
				if (options.key !== undefined && key !== options.key) continue;
				entries.push({
					...mustEntryRef(parsed.namespace, key, parsed.branch),
					updatedAt: stored.updatedAt,
				});
			}
		}
		return entries.sort(compareEntries).map((entry) => ({ ...entry }));
	}

	private nextSha(prefix: string): string {
		const value = `${prefix}${String(this.sequence).padStart(34, "0")}`;
		this.sequence += 1;
		return value;
	}

	private nextTimestamp(): string {
		const value = normalizeBrmemTimestamp(
			new Date(FAKE_EPOCH_MS + this.timestampSequence * 1000).toISOString(),
		);
		this.timestampSequence += 1;
		return value;
	}

	async listSnapshots(
		options: ListSnapshotsOptions,
	): Promise<BrmemResult<readonly ListedSnapshot[]>> {
		const error = this.operationErrors.listSnapshots;
		if (error !== undefined)
			return brmemError<readonly ListedSnapshot[]>(error.code, error.message);
		const snapshots: ListedSnapshot[] = [];
		for (const [id, snapshot] of this.snapshots) {
			const parsed = parseSnapshotId(id);
			if (options.namespace !== undefined && parsed.namespace !== options.namespace) continue;
			snapshots.push({
				namespace: parsed.namespace,
				branch: parsed.branch,
				refName: mustSnapshotRef(parsed.namespace, parsed.branch),
				entryCount: snapshot.entries.size,
			});
		}
		const sorted = snapshots.sort(compareSnapshots);
		for (let index = 0; index < sorted.length; index += 1) {
			options.onProgress?.({ processed: index + 1, total: sorted.length });
		}
		return brmemOk(sorted);
	}

	async listLocalBranches(): Promise<BrmemResult<ReadonlySet<string>>> {
		const error = this.operationErrors.listLocalBranches;
		if (error !== undefined) return brmemError(error.code, error.message);
		return brmemOk(new Set(this.localBranches));
	}

	async localBranchPresence(options: {
		branch: string;
	}): Promise<BrmemResult<"present" | "absent">> {
		const error = this.operationErrors.localBranchPresence;
		if (error !== undefined) return brmemError(error.code, error.message);
		return brmemOk(this.localBranches.has(options.branch) ? "present" : "absent");
	}

	async deleteSnapshot(options: { namespace: string; branch: string }): Promise<BrmemResult<void>> {
		const error = this.operationErrors.deleteSnapshot;
		if (error !== undefined) return brmemError(error.code, error.message);
		this.snapshots.delete(snapshotId(options.namespace, options.branch));
		return brmemOk(undefined);
	}

	async getRemoteConfig(
		remote: string,
	): Promise<import("./contracts.ts").BrmemOptionalResult<import("./gateway.ts").GitRemoteConfig>> {
		const error = this.operationErrors.remoteConfig;
		if (error !== undefined) return brmemOptionalError(error.code, error.message);
		const cfg = this.remotes.get(remote);
		if (cfg === undefined) return brmemMissing();
		return brmemFound({ push: [...cfg.push], fetch: [...cfg.fetch] });
	}

	async addRemoteRefspecs(
		remote: string,
		push: readonly string[],
		fetch: readonly string[],
	): Promise<import("./contracts.ts").BrmemResult<void>> {
		const error = this.operationErrors.addRefspecs;
		if (error !== undefined) return brmemError(error.code, error.message);
		const cfg = this.remotes.get(remote);
		if (cfg === undefined) return brmemOk(undefined);
		cfg.push = [...cfg.push, ...push];
		cfg.fetch = [...cfg.fetch, ...fetch];
		return brmemOk(undefined);
	}
}

function snapshotLookup(options: { namespace: string; branch: string; at?: string }): {
	namespace: string;
	branch: string;
	at?: string;
} {
	return {
		namespace: options.namespace,
		branch: options.branch,
		...(options.at === undefined ? {} : { at: options.at }),
	};
}

function deriveLocalBranches(
	currentBranch: FakeBrmemGatewayOptions["currentBranch"],
	entries: readonly FakeEntrySeed[],
): readonly string[] {
	const branches = new Set(entries.map((entry) => entry.branch));
	if (typeof currentBranch === "string") branches.add(currentBranch);
	return [...branches];
}

function compareSnapshots(left: ListedSnapshot, right: ListedSnapshot): number {
	if (left.namespace !== right.namespace) return left.namespace < right.namespace ? -1 : 1;
	if (left.branch !== right.branch) return left.branch < right.branch ? -1 : 1;
	return 0;
}

function snapshotId(namespace: string, branch: string): string {
	return `${namespace}\0${branch}`;
}

function parseSnapshotId(id: string): { namespace: string; branch: string } {
	const separator = id.indexOf("\0");
	return { namespace: id.slice(0, separator), branch: id.slice(separator + 1) };
}

function cloneSnapshot(snapshot: SnapshotState): SnapshotState {
	return {
		commitSha: snapshot.commitSha,
		entries: new Map([...snapshot.entries].map(([key, value]) => [key, { ...value }])),
	};
}

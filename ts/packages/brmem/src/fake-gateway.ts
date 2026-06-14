import { brmemError, brmemFound, brmemMissing, brmemOk, brmemOptionalError } from "./contracts.ts";
import type {
	BrmemGateway,
	CopyEntriesResult,
	DeleteEntryResult,
	EntryContent,
	EntryDiagnostic,
	PutEntryResult,
} from "./gateway.ts";
import { keyGlobMatches } from "./key-glob.ts";
import { compareEntries, mustEntryRef, type EntryRef } from "./ref-layout.ts";

export interface FakeEntrySeed {
	namespace: string;
	branch: string;
	key: string;
	content: string;
	headSha?: string | undefined;
	headDate?: string | undefined;
	blobSha?: string | undefined;
}

export interface FakeBrmemGatewayOptions {
	currentBranch?: string | { type: "detached" } | { type: "error"; code: string; message: string } | undefined;
	entries?: readonly FakeEntrySeed[] | undefined;
	operationErrors?: Partial<Record<"list" | "get" | "check" | "put" | "delete" | "copy", { code: string; message: string }>> | undefined;
}

interface StoredEntry {
	content: string;
	headSha: string;
	headDate: string;
	blobSha: string;
}

interface SnapshotState {
	commitSha: string;
	entries: Map<string, StoredEntry>;
}

export class FakeBrmemGateway implements BrmemGateway {
	private readonly branchState: FakeBrmemGatewayOptions["currentBranch"];
	private readonly operationErrors: NonNullable<FakeBrmemGatewayOptions["operationErrors"]>;
	private readonly snapshots: Map<string, SnapshotState>;
	private readonly snapshotsByCommit: Map<string, SnapshotState>;
	private sequence: number;

	constructor(options: FakeBrmemGatewayOptions = {}) {
		this.branchState = options.currentBranch ?? "main";
		this.operationErrors = { ...(options.operationErrors ?? {}) };
		this.snapshots = new Map();
		this.snapshotsByCommit = new Map();
		this.sequence = 1;
		for (const entry of options.entries ?? []) this.seedEntry(entry);
	}

	async currentBranch() {
		if (typeof this.branchState === "string") return brmemOk(this.branchState);
		if (this.branchState?.type === "error") return brmemError(this.branchState.code, this.branchState.message);
		return brmemError("detached_head", "Could not resolve current branch; HEAD appears detached.");
	}

	async listEntries(options: { namespace: string; key?: string | undefined; branch?: string | undefined }) {
		const error = this.operationErrors.list;
		if (error !== undefined) return brmemError<readonly EntryRef[]>(error.code, error.message);
		return brmemOk(this.collectEntries({ allNamespaces: false, ...options }));
	}

	async listAllEntries(options: { key?: string | undefined; branch?: string | undefined }) {
		const error = this.operationErrors.list;
		if (error !== undefined) return brmemError<readonly EntryRef[]>(error.code, error.message);
		return brmemOk(this.collectEntries({ allNamespaces: true, ...options }));
	}

	async getEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const error = this.operationErrors.get;
		if (error !== undefined) return brmemOptionalError<EntryContent>(error.code, error.message);
		const stored = this.resolveSnapshot(options)?.entries.get(options.key);
		if (stored === undefined) return brmemMissing<EntryContent>();
		return brmemFound({ content: stored.content });
	}

	async checkEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const error = this.operationErrors.check;
		if (error !== undefined) return brmemOptionalError<EntryDiagnostic>(error.code, error.message);
		const stored = this.resolveSnapshot(options)?.entries.get(options.key);
		if (stored === undefined) return brmemMissing<EntryDiagnostic>();
		return brmemFound({
			headSha: stored.headSha,
			headDate: stored.headDate,
			blobSha: stored.blobSha,
			sizeBytes: Buffer.byteLength(stored.content, "utf8"),
		});
	}

	async putEntry(options: { namespace: string; key: string; branch: string; content: string }) {
		const error = this.operationErrors.put;
		if (error !== undefined) return brmemError<PutEntryResult>(error.code, error.message);
		const snapshot = this.ensureSnapshot(options.namespace, options.branch);
		const commitSha = this.nextSha("commit");
		snapshot.commitSha = commitSha;
		snapshot.entries.set(options.key, {
			content: options.content,
			headSha: commitSha,
			headDate: "2026-01-01T00:00:00+00:00",
			blobSha: this.nextSha("blob"),
		});
		this.recordSnapshot(commitSha, snapshot);
		return brmemOk({ commitSha, entry: mustEntryRef(options.namespace, options.key, options.branch) });
	}

	async deleteEntry(options: { namespace: string; key: string; branch: string }) {
		const error = this.operationErrors.delete;
		if (error !== undefined) return brmemError<DeleteEntryResult>(error.code, error.message);
		const snapshot = this.snapshots.get(snapshotId(options.namespace, options.branch));
		if (snapshot === undefined || !snapshot.entries.has(options.key)) {
			return brmemError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
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
		keyGlob?: string | undefined;
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
			return brmemError("copy_conflict", `destination has conflicting entries: ${conflicts.sort().join(", ")}`);
		}
		if (options.keyGlob === undefined) dest.entries.clear();
		else {
			for (const key of [...dest.entries.keys()]) {
				if (keyGlobMatches(key, options.keyGlob)) dest.entries.delete(key);
			}
		}
		for (const [key, value] of sourcePairs) dest.entries.set(key, { ...value });
		dest.commitSha = this.nextSha("commit");
		this.recordSnapshot(dest.commitSha, dest);
		return brmemOk({
			entries: sourcePairs.map(([key]) => mustEntryRef(options.namespace, key, options.toBranch)).sort(compareEntries),
		});
	}

	private seedEntry(seed: FakeEntrySeed): void {
		const snapshot = this.ensureSnapshot(seed.namespace, seed.branch);
		const commitSha = seed.headSha ?? this.nextSha("commit");
		snapshot.commitSha = commitSha;
		snapshot.entries.set(seed.key, {
			content: seed.content,
			headSha: commitSha,
			headDate: seed.headDate ?? "2026-01-01T00:00:00+00:00",
			blobSha: seed.blobSha ?? this.nextSha("blob"),
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

	private resolveSnapshot(options: { namespace: string; branch: string; at?: string | undefined }): SnapshotState | undefined {
		if (options.at !== undefined) return this.snapshotsByCommit.get(options.at);
		return this.snapshots.get(snapshotId(options.namespace, options.branch));
	}

	private recordSnapshot(commitSha: string, snapshot: SnapshotState): void {
		this.snapshotsByCommit.set(commitSha, cloneSnapshot(snapshot));
	}

	private collectEntries(options: {
		allNamespaces: boolean;
		namespace?: string | undefined;
		key?: string | undefined;
		branch?: string | undefined;
	}): readonly EntryRef[] {
		const entries: EntryRef[] = [];
		for (const [id, snapshot] of this.snapshots) {
			const parsed = parseSnapshotId(id);
			if (!options.allNamespaces && parsed.namespace !== options.namespace) continue;
			if (options.branch !== undefined && parsed.branch !== options.branch) continue;
			for (const key of snapshot.entries.keys()) {
				if (options.key !== undefined && key !== options.key) continue;
				entries.push(mustEntryRef(parsed.namespace, key, parsed.branch));
			}
		}
		return entries.sort(compareEntries).map((entry) => ({ ...entry }));
	}

	private nextSha(prefix: string): string {
		const value = `${prefix}${String(this.sequence).padStart(34, "0")}`;
		this.sequence += 1;
		return value;
	}
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

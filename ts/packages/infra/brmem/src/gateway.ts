import type { BrmemOptionalResult, BrmemResult } from "./contracts.ts";
import type { EntryRef } from "./ref-layout.ts";

export interface EntryContent {
	content: string;
}

export interface EntryDiagnostic {
	headSha: string;
	headDate: string;
	blobSha: string;
	sizeBytes: number;
}

export interface PutEntryResult {
	commitSha: string;
	entry: EntryRef;
}

export interface DeleteEntryResult {
	commitSha: string;
	entry: EntryRef;
	isSnapshotEmpty: boolean;
}

export interface ListedEntry extends EntryRef {
	updatedAt: string;
}

export interface CopyEntriesResult {
	entries: readonly EntryRef[];
}

export interface ListedSnapshot {
	namespace: string;
	branch: string;
	refName: string;
	entryCount: number;
}

export interface ListSnapshotsProgress {
	processed: number;
	total: number;
}

export interface ListSnapshotsOptions {
	namespace?: string;
	onProgress?: (progress: ListSnapshotsProgress) => void;
}

export interface GitRemoteConfig {
	push: readonly string[];
	fetch: readonly string[];
}

export interface BrmemReadGateway {
	listEntries(options: {
		namespace: string;
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>>;

	getEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string;
	}): Promise<BrmemOptionalResult<EntryContent>>;

	checkEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string;
	}): Promise<BrmemOptionalResult<EntryDiagnostic>>;
}

export interface BrmemGateway extends BrmemReadGateway {
	currentBranch(): Promise<BrmemResult<string>>;

	listAllEntries(options: {
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>>;

	putEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>>;

	createEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>>;

	deleteEntry(options: {
		namespace: string;
		key: string;
		branch: string;
	}): Promise<BrmemResult<DeleteEntryResult>>;

	copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string;
	}): Promise<BrmemResult<CopyEntriesResult>>;

	listSnapshots(options: ListSnapshotsOptions): Promise<BrmemResult<readonly ListedSnapshot[]>>;

	listLocalBranches(): Promise<BrmemResult<ReadonlySet<string>>>;

	localBranchPresence(options: { branch: string }): Promise<BrmemResult<"present" | "absent">>;

	deleteSnapshot(options: { namespace: string; branch: string }): Promise<BrmemResult<void>>;

	getRemoteConfig(remote: string): Promise<BrmemOptionalResult<GitRemoteConfig>>;

	addRemoteRefspecs(
		remote: string,
		push: readonly string[],
		fetch: readonly string[],
	): Promise<BrmemResult<void>>;
}

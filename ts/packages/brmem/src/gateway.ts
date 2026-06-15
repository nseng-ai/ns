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

export interface GitRemoteConfig {
	push: readonly string[];
	fetch: readonly string[];
}

export interface BrmemGateway {
	currentBranch(): Promise<BrmemResult<string>>;

	listEntries(options: {
		namespace: string;
		key?: string | undefined;
		branch?: string | undefined;
	}): Promise<BrmemResult<readonly ListedEntry[]>>;

	listAllEntries(options: { key?: string | undefined; branch?: string | undefined }): Promise<BrmemResult<readonly ListedEntry[]>>;

	getEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string | undefined;
	}): Promise<BrmemOptionalResult<EntryContent>>;

	checkEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string | undefined;
	}): Promise<BrmemOptionalResult<EntryDiagnostic>>;

	putEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>>;

	deleteEntry(options: { namespace: string; key: string; branch: string }): Promise<BrmemResult<DeleteEntryResult>>;

	copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string | undefined;
	}): Promise<BrmemResult<CopyEntriesResult>>;

	getRemoteConfig(remote: string): Promise<BrmemOptionalResult<GitRemoteConfig>>;

	addRemoteRefspecs(remote: string, push: readonly string[], fetch: readonly string[]): Promise<BrmemResult<void>>;
}

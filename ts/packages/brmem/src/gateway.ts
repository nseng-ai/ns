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

export interface CopyEntriesResult {
	entries: readonly EntryRef[];
}

export interface BrmemGateway {
	currentBranch(): Promise<BrmemResult<string>>;

	listEntries(options: {
		namespace: string;
		key?: string | undefined;
		branch?: string | undefined;
	}): Promise<BrmemResult<readonly EntryRef[]>>;

	listAllEntries(options: { key?: string | undefined; branch?: string | undefined }): Promise<BrmemResult<readonly EntryRef[]>>;

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

	entryUpdatedAt(options: {
		namespace: string;
		key: string;
		branch: string;
	}): Promise<BrmemOptionalResult<string>>;

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
}

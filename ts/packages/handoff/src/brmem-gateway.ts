import type { HandoffOptionalResult, HandoffResult } from "./contracts.ts";

export interface HandoffEntryRef {
	namespace: string;
	key: string;
	branch: string;
	entryLocator: string;
}

export interface HandoffEntryDiagnostic {
	headSha: string;
	headDate: string;
	blobSha: string;
	sizeBytes: number;
}

export interface HandoffDeleteResult {
	commit: string;
}

export interface HandoffBrmemGateway {
	listEntries(options: { namespace: string; branch?: string | undefined }): Promise<HandoffResult<readonly HandoffEntryRef[]>>;
	check(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<HandoffEntryDiagnostic>>;
	delete(options: { namespace: string; key: string; branch: string }): Promise<HandoffResult<HandoffDeleteResult>>;
	entryUpdatedAt(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<string>>;
}

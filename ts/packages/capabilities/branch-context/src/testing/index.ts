import {
	FakeBrmemGateway,
	type BrmemGateway,
	type BrmemOptionalResult,
	type BrmemResult,
	type CopyEntriesResult,
	type DeleteEntryResult,
	type EntryContent,
	type EntryDiagnostic,
	type FakeBrmemGatewayOptions,
	type FakeEntrySeed,
	type GitRemoteConfig,
	type ListedEntry,
	type ListedSnapshot,
	type PutEntryResult,
} from "@ns/brmem";

import { BRANCH_CONTEXT_NAMESPACE } from "../core/constants.ts";

export interface InMemoryAttachedPlanState {
	branch: string;
	key: string;
	content?: string;
	refName?: string;
	commit?: string;
	sourceFile?: string;
}

export interface InMemoryBrmemGatewayState {
	currentBranch?: FakeBrmemGatewayOptions["currentBranch"];
	entries?: readonly InMemoryAttachedPlanState[];
	presenceFailure?: { code: string; message: string };
	attachFailure?: { code: string; message: string };
	listFailure?: { code: string; message: string };
	getFailure?: { code: string; message: string };
	deleteFailure?: { code: string; message: string };
}

export interface BrmemAttachmentCall {
	branch: string;
	key: string;
}

export interface BrmemListCall {
	branch?: string;
}

export interface BrmemPutCall {
	namespace: string;
	branch: string;
	key: string;
	content: string;
}

interface StoredAttachedPlan {
	branch: string;
	key: string;
	content: string;
	refName: string;
	commit: string;
	sourceFile: string;
}

export class InMemoryBranchMemoryGateway implements BrmemGateway {
	private readonly fake: FakeBrmemGateway;
	private readonly entries = new Map<string, StoredAttachedPlan>();
	readonly checkEntryCalls: BrmemAttachmentCall[] = [];
	readonly putEntryCalls: BrmemPutCall[] = [];
	readonly listEntriesCalls: BrmemListCall[] = [];
	readonly getEntryCalls: BrmemAttachmentCall[] = [];
	readonly deleteEntryCalls: BrmemAttachmentCall[] = [];

	constructor(state: InMemoryBrmemGatewayState = {}) {
		for (const entry of state.entries ?? [])
			this.entries.set(entryKey(entry.branch, entry.key), normalizeEntry(entry));
		this.fake = new FakeBrmemGateway({
			...(state.currentBranch === undefined ? {} : { currentBranch: state.currentBranch }),
			entries: (state.entries ?? []).map(toFakeEntry),
			operationErrors: {
				...(state.presenceFailure === undefined ? {} : { check: state.presenceFailure }),
				...(state.attachFailure === undefined ? {} : { put: state.attachFailure }),
				...(state.listFailure === undefined ? {} : { list: state.listFailure }),
				...(state.getFailure === undefined ? {} : { get: state.getFailure }),
				...(state.deleteFailure === undefined ? {} : { delete: state.deleteFailure }),
			},
		});
	}

	get attachmentPresenceCalls(): readonly BrmemAttachmentCall[] {
		return this.checkEntryCalls.map((call) => ({ ...call }));
	}

	get attachPlanCalls(): readonly BrmemPutCall[] {
		return this.putEntryCalls.map((call) => ({ ...call }));
	}

	get listAttachedPlansCalls(): readonly BrmemListCall[] {
		return this.listEntriesCalls.map((call) => ({ ...call }));
	}

	get getAttachedPlanCalls(): readonly BrmemAttachmentCall[] {
		return this.getEntryCalls.map((call) => ({ ...call }));
	}

	get attachedPlans(): readonly InMemoryAttachedPlanState[] {
		return [...this.entries.values()].map((entry) => ({ ...entry }));
	}

	async currentBranch(): Promise<BrmemResult<string>> {
		return await this.fake.currentBranch();
	}

	async listEntries(options: {
		namespace: string;
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>> {
		this.listEntriesCalls.push(options.branch === undefined ? {} : { branch: options.branch });
		return await this.fake.listEntries(options);
	}

	async listAllEntries(options: {
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>> {
		return await this.fake.listAllEntries(options);
	}

	async getEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string;
	}): Promise<BrmemOptionalResult<EntryContent>> {
		this.getEntryCalls.push({ branch: options.branch, key: options.key });
		return await this.fake.getEntry(options);
	}

	async checkEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string;
	}): Promise<BrmemOptionalResult<EntryDiagnostic>> {
		this.checkEntryCalls.push({ branch: options.branch, key: options.key });
		return await this.fake.checkEntry(options);
	}

	async putEntry(options: BrmemPutCall): Promise<BrmemResult<PutEntryResult>> {
		this.putEntryCalls.push({ ...options });
		const result = await this.fake.putEntry(options);
		this.recordEntryWriteResult(options, result);
		return result;
	}

	async createEntry(options: BrmemPutCall): Promise<BrmemResult<PutEntryResult>> {
		this.putEntryCalls.push({ ...options });
		const result = await this.fake.createEntry(options);
		this.recordEntryWriteResult(options, result);
		return result;
	}

	private recordEntryWriteResult(options: BrmemPutCall, result: BrmemResult<PutEntryResult>): void {
		if (result.type !== "ok" || options.namespace !== BRANCH_CONTEXT_NAMESPACE) return;
		this.entries.set(entryKey(options.branch, options.key), {
			branch: options.branch,
			key: options.key,
			content: options.content,
			refName: result.value.entry.entryLocator,
			commit: result.value.commitSha,
			sourceFile: "",
		});
	}

	async deleteEntry(options: {
		namespace: string;
		key: string;
		branch: string;
	}): Promise<BrmemResult<DeleteEntryResult>> {
		this.deleteEntryCalls.push({ branch: options.branch, key: options.key });
		const result = await this.fake.deleteEntry(options);
		if (result.type === "ok" && options.namespace === BRANCH_CONTEXT_NAMESPACE) {
			this.entries.delete(entryKey(options.branch, options.key));
		}
		return result;
	}

	async copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		return await this.fake.copyEntries(options);
	}

	async listSnapshots(options: {
		namespace?: string;
	}): Promise<BrmemResult<readonly ListedSnapshot[]>> {
		return await this.fake.listSnapshots(options);
	}

	async listLocalBranches(): Promise<BrmemResult<ReadonlySet<string>>> {
		return await this.fake.listLocalBranches();
	}

	async localBranchPresence(options: {
		branch: string;
	}): Promise<BrmemResult<"present" | "absent">> {
		return await this.fake.localBranchPresence(options);
	}

	async deleteSnapshot(options: { namespace: string; branch: string }): Promise<BrmemResult<void>> {
		return await this.fake.deleteSnapshot(options);
	}

	async getRemoteConfig(remote: string): Promise<BrmemOptionalResult<GitRemoteConfig>> {
		return await this.fake.getRemoteConfig(remote);
	}

	async addRemoteRefspecs(
		remote: string,
		push: readonly string[],
		fetch: readonly string[],
	): Promise<BrmemResult<void>> {
		return await this.fake.addRemoteRefspecs(remote, push, fetch);
	}
}

function toFakeEntry(entry: InMemoryAttachedPlanState): FakeEntrySeed {
	return {
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: entry.branch,
		key: entry.key,
		content: entry.content ?? "",
		...(entry.commit === undefined ? {} : { headSha: entry.commit }),
	};
}

function normalizeEntry(entry: InMemoryAttachedPlanState): StoredAttachedPlan {
	return {
		branch: entry.branch,
		key: entry.key,
		content: entry.content ?? "",
		refName: entry.refName ?? defaultRefName(entry.branch, entry.key),
		commit: entry.commit ?? "abc123",
		sourceFile: entry.sourceFile ?? `/tmp/${entry.key}`,
	};
}

function defaultRefName(branch: string, key: string): string {
	return `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`;
}

function entryKey(branch: string, key: string): string {
	return `${branch}\0${key}`;
}

import {
	type AttachedPlanEntry,
	type BrmemAttachPlanParams,
	type BrmemAttachmentParams,
	type BrmemAttachmentPresenceResult,
	type BrmemCwdParams,
	type BrmemErrorInfo,
	type BrmemGetContent,
	type BrmemPutData,
	type BrmemResult,
	type BranchContextBrmemGateway,
} from "../../src/brmem-gateway.ts";
import { BRANCH_CONTEXT_NAMESPACE } from "../../src/constants.ts";

export interface InMemoryAttachedPlanState {
	branch: string;
	key: string;
	content?: string;
	refName?: string;
	commit?: string;
	sourceFile?: string;
}

export interface InMemoryBrmemGatewayState {
	entries?: readonly InMemoryAttachedPlanState[];
	presenceFailure?: BrmemErrorInfo | undefined;
	attachFailure?: BrmemErrorInfo | undefined;
	listFailure?: BrmemErrorInfo | undefined;
	getFailure?: BrmemErrorInfo | undefined;
	deleteFailure?: BrmemErrorInfo | undefined;
}

export interface BrmemCall {
	cwd: string;
}

export interface BrmemAttachmentCall extends BrmemCall {
	branch: string;
	key: string;
}

export interface BrmemAttachPlanCall extends BrmemAttachmentCall {
	sourceFile: string;
}

export interface BrmemListCall extends BrmemCall {
	branch: string;
}

interface StoredAttachedPlan {
	branch: string;
	key: string;
	content: string;
	refName: string;
	commit: string;
	sourceFile: string;
}

export class InMemoryBranchContextBrmemGateway implements BranchContextBrmemGateway {
	private readonly entries = new Map<string, StoredAttachedPlan>();
	private readonly presenceFailure: BrmemErrorInfo | undefined;
	private readonly attachFailure: BrmemErrorInfo | undefined;
	private readonly listFailure: BrmemErrorInfo | undefined;
	private readonly getFailure: BrmemErrorInfo | undefined;
	private readonly deleteFailure: BrmemErrorInfo | undefined;
	private readonly attachmentPresenceLog: BrmemAttachmentCall[] = [];
	private readonly attachPlanLog: BrmemAttachPlanCall[] = [];
	private readonly listAttachedPlansLog: BrmemListCall[] = [];
	private readonly getAttachedPlanLog: BrmemAttachmentCall[] = [];
	private readonly deleteEntryLog: BrmemAttachmentCall[] = [];

	constructor(state: InMemoryBrmemGatewayState = {}) {
		for (const entry of state.entries ?? []) {
			this.entries.set(entryKey(entry.branch, entry.key), normalizeEntry(entry));
		}
		this.presenceFailure = state.presenceFailure;
		this.attachFailure = state.attachFailure;
		this.listFailure = state.listFailure;
		this.getFailure = state.getFailure;
		this.deleteFailure = state.deleteFailure;
	}

	get attachmentPresenceCalls(): readonly BrmemAttachmentCall[] {
		return copyAttachmentCalls(this.attachmentPresenceLog);
	}

	get attachPlanCalls(): readonly BrmemAttachPlanCall[] {
		return this.attachPlanLog.map((call) => ({ ...call }));
	}

	get listAttachedPlansCalls(): readonly BrmemListCall[] {
		return this.listAttachedPlansLog.map((call) => ({ ...call }));
	}

	get getAttachedPlanCalls(): readonly BrmemAttachmentCall[] {
		return copyAttachmentCalls(this.getAttachedPlanLog);
	}

	get deleteEntryCalls(): readonly BrmemAttachmentCall[] {
		return copyAttachmentCalls(this.deleteEntryLog);
	}

	get attachedPlans(): readonly InMemoryAttachedPlanState[] {
		return [...this.entries.values()]
			.map((entry) => ({ ...entry }))
			.sort((left, right) => `${left.branch}/${left.key}`.localeCompare(`${right.branch}/${right.key}`));
	}

	async attachmentPresence(params: BrmemAttachmentParams): Promise<BrmemAttachmentPresenceResult> {
		this.attachmentPresenceLog.push({ cwd: params.cwd, branch: params.branch, key: params.key });
		if (this.presenceFailure !== undefined) {
			return { type: "error", error: this.presenceFailure };
		}
		if (this.entries.has(entryKey(params.branch, params.key))) {
			return { type: "present", displayCommand: `brmem check ${params.key} --namespace ${BRANCH_CONTEXT_NAMESPACE} --branch ${params.branch} --format json` };
		}
		return { type: "absent" };
	}

	async attachPlan(params: BrmemAttachPlanParams): Promise<BrmemResult<BrmemPutData>> {
		this.attachPlanLog.push({ cwd: params.cwd, branch: params.branch, key: params.key, sourceFile: params.sourceFile });
		if (this.attachFailure !== undefined) {
			return { ok: false, error: this.attachFailure };
		}
		const key = entryKey(params.branch, params.key);
		if (this.entries.has(key)) {
			return { ok: false, error: { code: "brmem_entry_exists", message: `Attached plan already exists: ${params.branch}/${params.key}` } };
		}

		const stored: StoredAttachedPlan = {
			branch: params.branch,
			key: params.key,
			content: "",
			refName: defaultRefName(params.branch, params.key),
			commit: "abc123",
			sourceFile: params.sourceFile,
		};
		this.entries.set(key, stored);
		return { ok: true, value: putData(stored) };
	}

	async listAttachedPlans(params: BrmemCwdParams & { branch: string }): Promise<BrmemResult<AttachedPlanEntry[]>> {
		this.listAttachedPlansLog.push({ cwd: params.cwd, branch: params.branch });
		if (this.listFailure !== undefined) {
			return { ok: false, error: this.listFailure };
		}
		const entries = [...this.entries.values()]
			.filter((entry) => entry.branch === params.branch)
			.map((entry) => ({ namespace: BRANCH_CONTEXT_NAMESPACE, key: entry.key, branch: entry.branch, refName: entry.refName }))
			.sort((left, right) => left.key.localeCompare(right.key));
		return { ok: true, value: entries };
	}

	async getAttachedPlan(params: BrmemAttachmentParams): Promise<BrmemResult<BrmemGetContent>> {
		this.getAttachedPlanLog.push({ cwd: params.cwd, branch: params.branch, key: params.key });
		if (this.getFailure !== undefined) {
			return { ok: false, error: this.getFailure };
		}
		const entry = this.entries.get(entryKey(params.branch, params.key));
		if (entry === undefined) {
			return { ok: false, error: { code: "brmem_entry_missing", message: `Attached plan not found: ${params.branch}/${params.key}` } };
		}
		return { ok: true, value: { content: entry.content, refName: entry.refName } };
	}

	async deleteEntry(params: BrmemAttachmentParams): Promise<BrmemResult<void>> {
		this.deleteEntryLog.push({ cwd: params.cwd, branch: params.branch, key: params.key });
		if (this.deleteFailure !== undefined) {
			return { ok: false, error: this.deleteFailure };
		}
		this.entries.delete(entryKey(params.branch, params.key));
		return { ok: true, value: undefined };
	}
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

function putData(entry: StoredAttachedPlan): BrmemPutData {
	return {
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key: entry.key,
		branch: entry.branch,
		refName: entry.refName,
		commit: entry.commit,
		sourceFile: entry.sourceFile,
	};
}

function defaultRefName(branch: string, key: string): string {
	return `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`;
}

function entryKey(branch: string, key: string): string {
	return `${branch}\0${key}`;
}

function copyAttachmentCalls(calls: readonly BrmemAttachmentCall[]): BrmemAttachmentCall[] {
	return calls.map((call) => ({ ...call }));
}

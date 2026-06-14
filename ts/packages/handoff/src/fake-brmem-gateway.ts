import { buildEntryLocator, validateBranchName, validateEntryKey, validateNamespaceName } from "@asdl/brmem";

import type { HandoffBrmemGateway, HandoffDeleteResult, HandoffEntryDiagnostic, HandoffEntryRef } from "./brmem-gateway.ts";
import {
	handoffError,
	handoffFound,
	handoffMissing,
	handoffOk,
	handoffOptionalError,
	type HandoffErrorInfo,
	type HandoffOptionalResult,
	type HandoffResult,
} from "./contracts.ts";

export interface FakeEntrySeed {
	namespace: string;
	key: string;
	branch: string;
	content: string;
	updatedAt?: string | undefined;
}

export interface FakeBrmemGatewayOptions {
	entries?: readonly FakeEntrySeed[] | undefined;
	operationErrors?: Partial<Record<"list" | "check" | "delete" | "entryUpdatedAt", { code: string; message: string }>> | undefined;
	missingUpdatedAtBranches?: readonly string[] | undefined;
}

interface StoredEntry {
	content: string;
	commit: string;
	updatedAt: string;
}

const FAKE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export class FakeBrmemGateway implements HandoffBrmemGateway {
	private readonly entries: Map<string, StoredEntry>;
	private readonly operationErrors: NonNullable<FakeBrmemGatewayOptions["operationErrors"]>;
	private readonly missingUpdatedAtBranches: ReadonlySet<string>;
	private nextCommitNumber: number;

	constructor(options: FakeBrmemGatewayOptions = {}) {
		this.entries = new Map();
		this.operationErrors = { ...(options.operationErrors ?? {}) };
		this.missingUpdatedAtBranches = new Set(options.missingUpdatedAtBranches ?? []);
		this.nextCommitNumber = 1;
		for (const entry of options.entries ?? []) {
			this.put(entry.namespace, entry.key, entry.branch, entry.content, entry.updatedAt);
		}
	}

	async listEntries(options: { namespace: string; branch?: string | undefined }): Promise<HandoffResult<readonly HandoffEntryRef[]>> {
		const error = this.operationErrors.list;
		if (error !== undefined) return handoffError(error.code, error.message);
		const validation = validateNamespace(options.namespace);
		if (validation !== undefined) return handoffError(validation.code, validation.message, validation.displayCommand);
		if (options.branch !== undefined) {
			const branchValidation = validateBranch(options.branch);
			if (branchValidation !== undefined) return handoffError(branchValidation.code, branchValidation.message, branchValidation.displayCommand);
		}
		const refs: HandoffEntryRef[] = [];
		for (const [entryIdentity] of this.entries) {
			const entry = parseIdentity(entryIdentity);
			if (entry.namespace !== options.namespace) continue;
			if (options.branch !== undefined && entry.branch !== options.branch) continue;
			const locator = buildEntryLocator(entry.namespace, entry.key, entry.branch);
			if (locator.type === "error") return handoffError(locator.error.code, locator.error.message);
			refs.push({ namespace: entry.namespace, key: entry.key, branch: entry.branch, entryLocator: locator.value });
		}
		refs.sort((left, right) => compareTuple([left.namespace, left.key, left.branch], [right.namespace, right.key, right.branch]));
		return handoffOk(refs);
	}

	async check(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<HandoffEntryDiagnostic>> {
		const error = this.operationErrors.check;
		if (error !== undefined) return handoffOptionalError(error.code, error.message);
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffOptionalError(validation.code, validation.message, validation.displayCommand);
		const entry = this.entries.get(identity(options));
		if (entry === undefined) return handoffMissing();
		return handoffFound({
			headSha: entry.commit,
			headDate: entry.updatedAt,
			blobSha: `blob-${entry.commit}`,
			sizeBytes: Buffer.byteLength(entry.content, "utf8"),
		});
	}

	async delete(options: { namespace: string; key: string; branch: string }): Promise<HandoffResult<HandoffDeleteResult>> {
		const error = this.operationErrors.delete;
		if (error !== undefined) return handoffError(error.code, error.message);
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffError(validation.code, validation.message, validation.displayCommand);
		const id = identity(options);
		if (!this.entries.has(id)) return handoffError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
		this.entries.delete(id);
		return handoffOk({ commit: this.nextCommit() });
	}

	async entryUpdatedAt(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<string>> {
		const error = this.operationErrors.entryUpdatedAt;
		if (error !== undefined) return handoffOptionalError(error.code, error.message);
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffOptionalError(validation.code, validation.message, validation.displayCommand);
		if (this.missingUpdatedAtBranches.has(options.branch)) return handoffMissing();
		const entry = this.entries.get(identity(options));
		if (entry === undefined) return handoffMissing();
		return handoffFound(entry.updatedAt);
	}

	put(namespace: string, key: string, branch: string, content: string, updatedAt?: string | undefined): string {
		const validation = validateEntry(namespace, key, branch);
		if (validation !== undefined) throw new Error(validation.message);
		const commit = this.nextCommit();
		const timestamp = updatedAt ?? timestampForCommit(commit);
		this.entries.set(identity({ namespace, key, branch }), { content, commit, updatedAt: timestamp });
		return commit;
	}

	get(namespace: string, key: string, branch: string): string | undefined {
		return this.entries.get(identity({ namespace, key, branch }))?.content;
	}

	private nextCommit(): string {
		const commit = `fake-${String(this.nextCommitNumber).padStart(4, "0")}`;
		this.nextCommitNumber += 1;
		return commit;
	}
}

function validateEntry(namespace: string, key: string, branch: string): HandoffErrorInfo | undefined {
	const namespaceValidation = validateNamespace(namespace);
	if (namespaceValidation !== undefined) return namespaceValidation;
	const keyValidation = validateEntryKey(key);
	if (keyValidation.type === "invalid") return { code: "invalid_key", message: `Invalid key ${JSON.stringify(key)}: ${keyValidation.reason}` };
	return validateBranch(branch);
}

function validateNamespace(namespace: string): HandoffErrorInfo | undefined {
	const validation = validateNamespaceName(namespace);
	if (validation.type === "invalid") return { code: "invalid_namespace", message: `Invalid namespace ${JSON.stringify(namespace)}: ${validation.reason}` };
	return undefined;
}

function validateBranch(branch: string): HandoffErrorInfo | undefined {
	const validation = validateBranchName(branch);
	if (validation.type === "invalid") return { code: "invalid_branch_name", message: `Invalid branch name ${JSON.stringify(branch)}: ${validation.reason}` };
	return undefined;
}

function identity(options: { namespace: string; key: string; branch: string }): string {
	return `${options.namespace}\0${options.key}\0${options.branch}`;
}

function parseIdentity(value: string): { namespace: string; key: string; branch: string } {
	const [namespace, key, branch] = value.split("\0");
	if (namespace === undefined || key === undefined || branch === undefined) throw new Error(`invalid fake entry identity ${JSON.stringify(value)}`);
	return { namespace, key, branch };
}

function timestampForCommit(commit: string): string {
	const numeric = Number(commit.slice("fake-".length));
	return new Date(FAKE_EPOCH_MS + numeric * 1000).toISOString().replace(".000Z", "+00:00");
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
	for (let index = 0; index < left.length; index += 1) {
		const leftValue = left[index] ?? "";
		const rightValue = right[index] ?? "";
		if (leftValue === rightValue) continue;
		return leftValue < rightValue ? -1 : 1;
	}
	return 0;
}

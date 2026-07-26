import {
	mustEntryLocator,
	putEntryFromFile,
	type BrmemErrorInfo,
	type BrmemGateway,
} from "@nseng-ai/brmem";
import type { Result } from "@nseng-ai/foundation/result";

import { BRANCH_CONTEXT_NAMESPACE } from "./constants.ts";

export interface AttachedPlanEntry {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
}

export interface BranchContextAttachData {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	commit: string;
	sourceFile: string;
}

export interface BrmemGetContent {
	content: string;
	refName: string;
}

export type BranchContextBrmemResult<T> = Result<T, BrmemErrorInfo>;

export type BrmemAttachmentPresenceResult =
	| { type: "present" }
	| { type: "absent" }
	| { type: "error"; error: BrmemErrorInfo };

export function throwBranchContextBrmemError(error: BrmemErrorInfo): never {
	throw new Error(error.message);
}

export function unwrapBranchContextBrmemResult<T>(result: BranchContextBrmemResult<T>): T {
	if (!result.ok) throwBranchContextBrmemError(result.error);
	return result.value;
}

export async function checkBranchContextEntryPresence(
	brmem: BrmemGateway,
	params: { branch: string; key: string },
): Promise<BrmemAttachmentPresenceResult> {
	const check = await brmem.checkEntry({
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: params.branch,
		key: params.key,
	});
	if (check.type === "found") return { type: "present" };
	if (check.type === "missing") return { type: "absent" };
	return { type: "error", error: check.error };
}

export async function attachBranchContextPlan(
	brmem: BrmemGateway,
	params: { cwd: string; branch: string; key: string; sourceFile: string },
): Promise<BranchContextBrmemResult<BranchContextAttachData>> {
	const attach = await putEntryFromFile({
		gateway: brmem,
		cwd: params.cwd,
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: params.branch,
		key: params.key,
		sourceFile: params.sourceFile,
	});
	if (attach.type === "error") return { ok: false, error: attach.error };
	return {
		ok: true,
		value: {
			namespace: attach.value.namespace,
			key: attach.value.key,
			branch: attach.value.branch,
			refName: attach.value.entryLocator,
			commit: attach.value.commitSha,
			sourceFile: attach.value.sourceFile,
		},
	};
}

export async function listBranchContextPlans(
	brmem: BrmemGateway,
	params: { branch: string },
): Promise<BranchContextBrmemResult<AttachedPlanEntry[]>> {
	const list = await brmem.listEntries({
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: params.branch,
	});
	if (list.type === "error") return { ok: false, error: list.error };
	return {
		ok: true,
		value: list.value.map((entry) => ({
			namespace: entry.namespace,
			key: entry.key,
			branch: entry.branch,
			refName: entry.entryLocator,
		})),
	};
}

export async function getBranchContextPlan(
	brmem: BrmemGateway,
	params: { branch: string; key: string },
): Promise<BranchContextBrmemResult<BrmemGetContent>> {
	const get = await brmem.getEntry({
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: params.branch,
		key: params.key,
	});
	if (get.type === "error") return { ok: false, error: get.error };
	if (get.type === "missing") {
		return {
			ok: false,
			error: {
				code: "key-not-found",
				message: `Branch-context key ${JSON.stringify(params.key)} not found on branch ${JSON.stringify(params.branch)}.`,
			},
		};
	}
	return {
		ok: true,
		value: {
			content: get.value.content,
			refName: mustEntryLocator(BRANCH_CONTEXT_NAMESPACE, params.key, params.branch),
		},
	};
}

export async function deleteBranchContextPlan(
	brmem: BrmemGateway,
	params: { branch: string; key: string },
): Promise<BranchContextBrmemResult<void>> {
	const deleted = await brmem.deleteEntry({
		namespace: BRANCH_CONTEXT_NAMESPACE,
		branch: params.branch,
		key: params.key,
	});
	if (deleted.type === "error") return { ok: false, error: deleted.error };
	return { ok: true, value: undefined };
}

import {
	brmemCommandFailure,
	checkBrmemEntry,
	parseBrmemMachineEnvelopeData,
	parseBrmemPutData,
	putBrmemEntryFromFile,
	requireBrmemStringFields,
	runAvailableBrmemCommand,
	type BrmemCommandErrorInfo,
	type BrmemCommandResult,
	type BrmemPutData,
	type CompletedBrmemRun,
} from "@asdl/core/brmem-cli";
import { MAX_ERROR_CHARS, tailText, type CommandExecApi } from "@asdl/core/exec";
import { isRecord } from "@asdl/core/primitives";

import { BRANCH_CONTEXT_NAMESPACE } from "./constants.ts";

export interface BrmemCwdParams {
	cwd: string;
	signal?: AbortSignal | undefined;
}

export interface BrmemAttachmentParams extends BrmemCwdParams {
	branch: string;
	key: string;
}

export interface BrmemAttachPlanParams extends BrmemAttachmentParams {
	sourceFile: string;
}

export interface AttachedPlanEntry {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
}

export type { BrmemPutData } from "@asdl/core/brmem-cli";

export interface BrmemGetContent {
	content: string;
	refName: string;
}

export type BrmemErrorInfo = BrmemCommandErrorInfo;

export type BrmemResult<T> = BrmemCommandResult<T>;

export type BrmemAttachmentPresenceResult =
	| { type: "present"; displayCommand: string }
	| { type: "absent" }
	| { type: "error"; error: BrmemErrorInfo };

export interface BranchContextBrmemGateway {
	attachmentPresence(params: BrmemAttachmentParams): Promise<BrmemAttachmentPresenceResult>;
	attachPlan(params: BrmemAttachPlanParams): Promise<BrmemResult<BrmemPutData>>;
	listAttachedPlans(
		params: BrmemCwdParams & { branch: string },
	): Promise<BrmemResult<AttachedPlanEntry[]>>;
	getAttachedPlan(params: BrmemAttachmentParams): Promise<BrmemResult<BrmemGetContent>>;
	deleteEntry(params: BrmemAttachmentParams): Promise<BrmemResult<void>>;
}

export class RealBranchContextBrmemGateway implements BranchContextBrmemGateway {
	private readonly pi: CommandExecApi;

	constructor(pi: CommandExecApi) {
		this.pi = pi;
	}

	async attachmentPresence(params: BrmemAttachmentParams): Promise<BrmemAttachmentPresenceResult> {
		return checkBrmemEntry({
			gateway: this.pi,
			cwd: params.cwd,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: params.key,
			branch: params.branch,
			signal: params.signal,
		});
	}

	async attachPlan(params: BrmemAttachPlanParams): Promise<BrmemResult<BrmemPutData>> {
		return putBrmemEntryFromFile({
			gateway: this.pi,
			cwd: params.cwd,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: params.key,
			branch: params.branch,
			sourceFile: params.sourceFile,
			signal: params.signal,
		});
	}

	async listAttachedPlans(
		params: BrmemCwdParams & { branch: string },
	): Promise<BrmemResult<AttachedPlanEntry[]>> {
		const run = await this.runBrmem(params, [
			"list",
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			params.branch,
			"--format",
			"json",
		]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_list_failed", "brmem list failed", run.value) };
		}

		try {
			return {
				ok: true,
				value: parseBrmemListEntries(run.value.result.stdout, {
					namespace: BRANCH_CONTEXT_NAMESPACE,
					branch: params.branch,
				}),
			};
		} catch (caught) {
			return {
				ok: false,
				error: {
					code: "brmem_malformed_list",
					message: caught instanceof Error ? caught.message : String(caught),
					displayCommand: run.value.displayCommand,
				},
			};
		}
	}

	async getAttachedPlan(params: BrmemAttachmentParams): Promise<BrmemResult<BrmemGetContent>> {
		const run = await this.runBrmem(params, [
			"get",
			params.key,
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			params.branch,
			"--format",
			"json",
		]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_get_failed", "brmem get failed", run.value) };
		}

		try {
			return {
				ok: true,
				value: parseBrmemGetContent(run.value.result.stdout, {
					namespace: BRANCH_CONTEXT_NAMESPACE,
					branch: params.branch,
					key: params.key,
				}),
			};
		} catch (caught) {
			return {
				ok: false,
				error: {
					code: "brmem_malformed_get",
					message: caught instanceof Error ? caught.message : String(caught),
					displayCommand: run.value.displayCommand,
				},
			};
		}
	}

	async deleteEntry(params: BrmemAttachmentParams): Promise<BrmemResult<void>> {
		const run = await this.runBrmem(params, [
			"delete",
			params.key,
			"--namespace",
			BRANCH_CONTEXT_NAMESPACE,
			"--branch",
			params.branch,
			"--format",
			"json",
		]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_delete_failed", "brmem delete failed", run.value) };
		}
		return { ok: true, value: undefined };
	}

	private async runBrmem(
		params: BrmemCwdParams,
		args: string[],
	): Promise<BrmemResult<CompletedBrmemRun>> {
		return runAvailableBrmemCommand({
			gateway: this.pi,
			cwd: params.cwd,
			brmemArgs: args,
			signal: params.signal,
		});
	}
}

export { parseBrmemPutData };

export function parseBrmemListEntries(
	stdout: string,
	expected: { namespace: string; branch: string },
): AttachedPlanEntry[] {
	const data = parseBrmemMachineEnvelopeData(stdout, "brmem list JSON");

	const entries = data.entries;
	if (!Array.isArray(entries)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected data.entries array");
	}

	return entries.map((entry, index) => parseListEntry(entry, index, stdout, expected));
}

export function parseBrmemGetContent(
	stdout: string,
	expected: { namespace: string; branch: string; key: string },
): BrmemGetContent {
	const data = parseBrmemMachineEnvelopeData(stdout, "brmem get JSON");
	const fields = requireBrmemStringFields(
		data,
		["namespace", "key", "branch", "content", "ref_name"],
		{
			commandName: "brmem get",
			stdout,
		},
	);

	const { namespace, key, branch, content } = fields;
	const refName = fields.ref_name;

	const mismatches = expectedMismatches({ namespace, branch, key }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope(
			"brmem get",
			stdout,
			`expected requested data (${mismatches.join(", ")})`,
		);
	}

	return { content, refName };
}

function parseListEntry(
	value: unknown,
	index: number,
	stdout: string,
	expected: { namespace: string; branch: string },
): AttachedPlanEntry {
	if (!isRecord(value)) {
		throw malformedBrmemEnvelope("brmem list", stdout, `expected data.entries[${index}] object`);
	}

	const fields = requireBrmemStringFields(value, ["namespace", "key", "branch", "ref_name"], {
		commandName: "brmem list",
		stdout,
		pathPrefix: `data.entries[${index}]`,
	});
	const { namespace, key, branch } = fields;
	const refName = fields.ref_name;

	const mismatches = expectedMismatches({ namespace, branch }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope(
			"brmem list",
			stdout,
			`expected canonical entry at data.entries[${index}] (${mismatches.join(", ")})`,
		);
	}

	return { namespace, key, branch, refName };
}

function expectedMismatches(
	actual: Record<string, string>,
	expected: Record<string, string>,
): string[] {
	const mismatches: string[] = [];
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (actual[field] !== expectedValue) {
			mismatches.push(
				`${field} ${JSON.stringify(actual[field])} != ${JSON.stringify(expectedValue)}`,
			);
		}
	}
	return mismatches;
}

function failure(code: string, title: string, run: CompletedBrmemRun): BrmemErrorInfo {
	return brmemCommandFailure(code, title, run);
}

function malformedBrmemEnvelope(commandName: string, stdout: string, reason: string): Error {
	return new Error(
		`Malformed ${commandName} JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`,
	);
}

import { formatBrmemUnavailableMessage, runFirstAvailableBrmemCommand } from "./brmem-cli.ts";
import { tailText, type ExecResult } from "./command-runtime.ts";
import { PLAN_BRANCH_NAMESPACE } from "./constants.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";
import { formatCommandFailure, type PlanCommandExecApi } from "@asdl/plans";
import { isRecord } from "./primitives.ts";

const BRMEM_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;

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

export interface BrmemPutData {
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

export interface BrmemErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type BrmemResult<T> = { ok: true; value: T } | { ok: false; error: BrmemErrorInfo };

export type BrmemAttachmentPresenceResult =
	| { type: "present"; displayCommand: string }
	| { type: "absent" }
	| { type: "error"; error: BrmemErrorInfo };

export interface PlannedBranchBrmemGateway {
	attachmentPresence(params: BrmemAttachmentParams): Promise<BrmemAttachmentPresenceResult>;
	attachPlan(params: BrmemAttachPlanParams): Promise<BrmemResult<BrmemPutData>>;
	listAttachedPlans(params: BrmemCwdParams & { branch: string }): Promise<BrmemResult<AttachedPlanEntry[]>>;
	getAttachedPlan(params: BrmemAttachmentParams): Promise<BrmemResult<BrmemGetContent>>;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = { ok: true; value: CommandRun } | { ok: false; error: BrmemErrorInfo };

export class RealPlannedBranchBrmemGateway implements PlannedBranchBrmemGateway {
	private readonly pi: PlanCommandExecApi;

	constructor(pi: PlanCommandExecApi) {
		this.pi = pi;
	}

	async attachmentPresence(params: BrmemAttachmentParams): Promise<BrmemAttachmentPresenceResult> {
		const run = await this.runBrmem(params, ["check", params.key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", params.branch, "--format", "json"]);
		if (!run.ok) return { type: "error", error: run.error };
		if (run.value.result.killed) {
			return { type: "error", error: failure("brmem_check_killed", "brmem check timed out or was killed", run.value) };
		}
		if (run.value.result.code === 0) {
			return { type: "present", displayCommand: run.value.displayCommand };
		}
		if (run.value.result.code === 1) {
			return { type: "absent" };
		}
		return { type: "error", error: failure("brmem_check_failed", "brmem check failed", run.value) };
	}

	async attachPlan(params: BrmemAttachPlanParams): Promise<BrmemResult<BrmemPutData>> {
		const run = await this.runBrmem(params, [
			"put",
			params.key,
			"--namespace",
			PLAN_BRANCH_NAMESPACE,
			"--branch",
			params.branch,
			"--file",
			params.sourceFile,
			"--format",
			"json",
		]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_put_failed", "brmem put failed", run.value) };
		}

		try {
			const data = parseBrmemPutData(run.value.result.stdout);
			const mismatch = validatePutData(data, params);
			if (mismatch !== undefined) {
				return {
					ok: false,
					error: {
						code: "brmem_unexpected_put_data",
						message: mismatch.message,
						displayCommand: run.value.displayCommand,
					},
				};
			}
			return { ok: true, value: data };
		} catch (caught) {
			return {
				ok: false,
				error: {
					code: "brmem_malformed_put",
					message: caught instanceof Error ? caught.message : String(caught),
					displayCommand: run.value.displayCommand,
				},
			};
		}
	}

	async listAttachedPlans(params: BrmemCwdParams & { branch: string }): Promise<BrmemResult<AttachedPlanEntry[]>> {
		const run = await this.runBrmem(params, ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", params.branch, "--format", "json"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_list_failed", "brmem list failed", run.value) };
		}

		try {
			return { ok: true, value: parseBrmemListEntries(run.value.result.stdout, { namespace: PLAN_BRANCH_NAMESPACE, branch: params.branch }) };
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
		const run = await this.runBrmem(params, ["get", params.key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", params.branch, "--format", "json"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("brmem_get_failed", "brmem get failed", run.value) };
		}

		try {
			return { ok: true, value: parseBrmemGetContent(run.value.result.stdout, { namespace: PLAN_BRANCH_NAMESPACE, branch: params.branch, key: params.key }) };
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

	private async runBrmem(params: BrmemCwdParams, args: string[]): Promise<CommandRunResult> {
		const run = await runFirstAvailableBrmemCommand({
			gateway: this.pi,
			cwd: params.cwd,
			brmemArgs: args,
			timeoutMs: BRMEM_TIMEOUT_MS,
			signal: params.signal,
		});
		if (run.type === "unavailable") {
			return { ok: false, error: { code: "brmem_unavailable", message: formatBrmemUnavailableMessage(run.failures) } };
		}
		return { ok: true, value: { result: run.result, displayCommand: run.displayCommand } };
	}
}

export function parseBrmemPutData(stdout: string): BrmemPutData {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem put JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

	const namespace = data.namespace;
	const key = data.key;
	const branch = data.branch;
	const refName = data.ref_name;
	const commit = data.commit;
	const sourceFile = data.source_file;
	if (
		typeof namespace !== "string" ||
		typeof key !== "string" ||
		typeof branch !== "string" ||
		typeof refName !== "string" ||
		typeof commit !== "string" ||
		typeof sourceFile !== "string"
	) {
		throw malformedBrmemEnvelope(
			"brmem put",
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.ref_name, data.commit, and data.source_file",
		);
	}

	return { namespace, key, branch, refName, commit, sourceFile };
}

export function parseBrmemListEntries(stdout: string, expected: { namespace: string; branch: string }): AttachedPlanEntry[] {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem list JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

	const entries = data.entries;
	if (!Array.isArray(entries)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected data.entries array");
	}

	return entries.map((entry, index) => parseListEntry(entry, index, stdout, expected));
}

export function parseBrmemGetContent(stdout: string, expected: { namespace: string; branch: string; key: string }): BrmemGetContent {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem get JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

	const namespace = data.namespace;
	const key = data.key;
	const branch = data.branch;
	const content = data.content;
	const refName = data.ref_name;
	if (
		typeof namespace !== "string" ||
		typeof key !== "string" ||
		typeof branch !== "string" ||
		typeof content !== "string" ||
		typeof refName !== "string"
	) {
		throw malformedBrmemEnvelope(
			"brmem get",
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.content, and data.ref_name",
		);
	}

	const mismatches = expectedMismatches({ namespace, branch, key }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope("brmem get", stdout, `expected requested data (${mismatches.join(", ")})`);
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

	const namespace = value.namespace;
	const key = value.key;
	const branch = value.branch;
	const refName = value.ref_name;
	if (typeof namespace !== "string" || typeof key !== "string" || typeof branch !== "string" || typeof refName !== "string") {
		throw malformedBrmemEnvelope(
			"brmem list",
			stdout,
			`expected string fields data.entries[${index}].namespace, key, branch, and ref_name`,
		);
	}

	const mismatches = expectedMismatches({ namespace, branch }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope("brmem list", stdout, `expected canonical entry at data.entries[${index}] (${mismatches.join(", ")})`);
	}

	return { namespace, key, branch, refName };
}

function validatePutData(data: BrmemPutData, expected: BrmemAttachPlanParams): Error | undefined {
	const mismatches = expectedMismatches(
		{ namespace: data.namespace, key: data.key, branch: data.branch, source_file: data.sourceFile },
		{ namespace: PLAN_BRANCH_NAMESPACE, key: expected.key, branch: expected.branch, source_file: expected.sourceFile },
	);
	if (mismatches.length === 0) {
		return undefined;
	}
	return new Error(`Unexpected brmem put JSON data: ${mismatches.join(", ")}.`);
}

function expectedMismatches(actual: Record<string, string>, expected: Record<string, string>): string[] {
	const mismatches: string[] = [];
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (actual[field] !== expectedValue) {
			mismatches.push(`${field} ${JSON.stringify(actual[field])} != ${JSON.stringify(expectedValue)}`);
		}
	}
	return mismatches;
}

function failure(code: string, title: string, run: CommandRun): BrmemErrorInfo {
	return { code, message: formatCommandFailure(title, run.displayCommand, run.result), displayCommand: run.displayCommand };
}

function malformedBrmemEnvelope(commandName: string, stdout: string, reason: string): Error {
	return new Error(`Malformed ${commandName} JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

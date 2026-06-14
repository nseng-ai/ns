import { buildSnapshotRef, validateBranchName, validateEntryKey, validateNamespaceName } from "@asdl/brmem";
import { runAvailableBrmemCommand } from "@asdl/core/brmem-cli";
import { formatCommandFailure, NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { isRecord } from "@asdl/core/primitives";

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

const GIT_TIMEOUT_MS = 10_000;

export class RealBrmemCliGateway implements HandoffBrmemGateway {
	private readonly cwd: string;
	private readonly execApi: CommandExecApi;

	constructor(options: { cwd: string; execApi?: CommandExecApi | undefined }) {
		this.cwd = options.cwd;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
	}

	async listEntries(options: { namespace: string; branch?: string | undefined }): Promise<HandoffResult<readonly HandoffEntryRef[]>> {
		const validation = validateNamespace(options.namespace);
		if (validation !== undefined) return handoffError(validation.code, validation.message, validation.displayCommand);
		if (options.branch !== undefined) {
			const branchValidation = validateBranch(options.branch);
			if (branchValidation !== undefined) return handoffError(branchValidation.code, branchValidation.message, branchValidation.displayCommand);
		}

		const args = ["list", "--namespace", options.namespace, "--format", "json"];
		if (options.branch === undefined) args.push("--all-branches");
		else args.push("--branch", options.branch);
		const run = await runAvailableBrmemCommand({ gateway: this.execApi, cwd: this.cwd, brmemArgs: args });
		if (!run.ok) return handoffError(run.error.code, run.error.message, run.error.displayCommand);
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return handoffError("brmem_list_failed", formatCommandFailure("brmem list failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const data = parseEnvelopeData(run.value.result.stdout, "brmem list");
		if (data.type === "error") return data;
		const entries = data.value["entries"];
		if (!Array.isArray(entries)) return handoffError("brmem_malformed_json", "brmem data.entries is not a list.");
		const parsed: HandoffEntryRef[] = [];
		for (const entry of entries) {
			const ref = parseEntryRef(entry);
			if (ref.type === "error") return ref;
			parsed.push(ref.value);
		}
		return handoffOk(parsed);
	}

	async check(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<HandoffEntryDiagnostic>> {
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffOptionalError(validation.code, validation.message, validation.displayCommand);
		const run = await runAvailableBrmemCommand({
			gateway: this.execApi,
			cwd: this.cwd,
			brmemArgs: ["check", options.key, "--namespace", options.namespace, "--branch", options.branch, "--format", "json"],
		});
		if (!run.ok) return handoffOptionalError(run.error.code, run.error.message, run.error.displayCommand);
		if (run.value.result.killed || (run.value.result.code !== 0 && run.value.result.code !== 1)) {
			return handoffOptionalError("brmem_check_failed", formatCommandFailure("brmem check failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		const data = parseEnvelopeData(run.value.result.stdout, "brmem check");
		if (data.type === "error") return handoffOptionalError(data.error.code, data.error.message, data.error.displayCommand);
		if (data.value["head_sha"] === null) return handoffMissing();
		const diagnostic = parseDiagnostic(data.value);
		if (diagnostic.type === "error") return handoffOptionalError(diagnostic.error.code, diagnostic.error.message, diagnostic.error.displayCommand);
		return handoffFound(diagnostic.value);
	}

	async delete(options: { namespace: string; key: string; branch: string }): Promise<HandoffResult<HandoffDeleteResult>> {
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffError(validation.code, validation.message, validation.displayCommand);
		const run = await runAvailableBrmemCommand({
			gateway: this.execApi,
			cwd: this.cwd,
			brmemArgs: ["delete", options.key, "--namespace", options.namespace, "--branch", options.branch, "--format", "json"],
		});
		if (!run.ok) return handoffError(run.error.code, run.error.message, run.error.displayCommand);
		const envelope = parseEnvelope(run.value.result.stdout, "brmem delete");
		if (run.value.result.code !== 0 || run.value.result.killed) {
			if (envelope.type === "ok" && envelope.value.exitCode === 2 && envelope.value.errorType === "key_not_found") {
				return handoffError("key_not_found", envelope.value.message ?? "key not found");
			}
			return handoffError("brmem_delete_failed", formatCommandFailure("brmem delete failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		if (envelope.type === "error") return envelope;
		if (!isRecord(envelope.value.data)) return handoffError("brmem_malformed_json", "brmem delete data is not an object.");
		const commit = envelope.value.data["commit"];
		if (typeof commit !== "string" || commit.length === 0) return handoffError("brmem_malformed_json", "brmem data.commit is missing.");
		return handoffOk({ commit });
	}

	async entryUpdatedAt(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<string>> {
		const validation = validateEntry(options.namespace, options.key, options.branch);
		if (validation !== undefined) return handoffOptionalError(validation.code, validation.message, validation.displayCommand);
		const snapshotRef = buildSnapshotRef(options.namespace, options.branch);
		if (snapshotRef.type === "error") return handoffOptionalError(snapshotRef.error.code, snapshotRef.error.message);
		const target = `${snapshotRef.value}:${options.key}`;
		const exists = await this.execApi.exec("git", ["cat-file", "-e", target], { cwd: this.cwd, timeout: GIT_TIMEOUT_MS });
		if (exists.code !== 0 || exists.killed) return handoffMissing();

		const result = await this.execApi.exec("git", ["log", "-1", "--format=%cI", snapshotRef.value, "--", options.key], {
			cwd: this.cwd,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return handoffOptionalError("git_failure", formatCommandFailure("Could not resolve handoff updated timestamp", "git log -1 --format=%cI", result));
		}
		const updatedAt = result.stdout.trim();
		if (updatedAt.length === 0) return handoffMissing();
		return handoffFound(updatedAt);
	}
}

interface ParsedEnvelope {
	exitCode: number;
	data: unknown;
	errorType?: string | undefined;
	message?: string | undefined;
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

function parseEnvelopeData(stdout: string, label: string): HandoffResult<Record<string, unknown>> {
	const envelope = parseEnvelope(stdout, label);
	if (envelope.type === "error") return envelope;
	if (envelope.value.exitCode !== 0) return handoffError(envelope.value.errorType ?? `${label.replaceAll(" ", "_")}_failed`, envelope.value.message ?? `${label} failed.`);
	if (!isRecord(envelope.value.data)) return handoffError("brmem_malformed_json", `${label} data is not an object.`);
	return handoffOk(envelope.value.data);
}

function parseEnvelope(stdout: string, label: string): HandoffResult<ParsedEnvelope> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		return handoffError("brmem_malformed_json", `${label} returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isRecord(parsed)) return handoffError("brmem_malformed_json", `${label} returned non-object JSON.`);
	const exitCode = parsed["exit_code"];
	if (typeof exitCode !== "number" || !Number.isFinite(exitCode)) return handoffError("brmem_malformed_json", `${label} missing numeric exit_code.`);
	const message = typeof parsed["message"] === "string" ? parsed["message"] : undefined;
	const errorType = typeof parsed["error_type"] === "string" ? parsed["error_type"] : undefined;
	return handoffOk({ exitCode, data: parsed["data"], errorType, message });
}

function parseEntryRef(value: unknown): HandoffResult<HandoffEntryRef> {
	if (!isRecord(value)) return handoffError("brmem_malformed_json", "brmem list returned a malformed entry.");
	const namespace = requiredString(value, "namespace");
	const key = requiredString(value, "key");
	const branch = requiredString(value, "branch");
	const entryLocator = requiredString(value, "ref_name");
	if (namespace === undefined || key === undefined || branch === undefined || entryLocator === undefined) {
		return handoffError("brmem_malformed_json", "brmem list entry is missing required string fields.");
	}
	return handoffOk({ namespace, key, branch, entryLocator });
}

function parseDiagnostic(value: Record<string, unknown>): HandoffResult<HandoffEntryDiagnostic> {
	const headSha = requiredString(value, "head_sha");
	const headDate = requiredString(value, "head_date");
	const blobSha = requiredString(value, "blob_sha");
	const sizeBytes = value["size_bytes"];
	if (headSha === undefined || headDate === undefined || blobSha === undefined || typeof sizeBytes !== "number") {
		return handoffError("brmem_malformed_json", "brmem check data is missing diagnostic fields.");
	}
	return handoffOk({ headSha, headDate, blobSha, sizeBytes });
}

function requiredString(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	return typeof field === "string" && field.length > 0 ? field : undefined;
}

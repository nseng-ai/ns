import {
	brmemError,
	brmemFound,
	brmemMissing,
	brmemOk,
	brmemOptionalError,
	mustEntryLocator,
	type BrmemErrorInfo,
	type BrmemGateway,
	type BrmemResult,
	type DeleteEntryResult,
	type EntryContent,
	type EntryDiagnostic,
	type ListedEntry,
	type PutEntryResult,
} from "@sdl/brmem";
import { checkBrmemEntry } from "@sdl/core/brmem-cli";
import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	type ExecResult,
} from "@sdl/core/exec";
import type { GitBranchPresenceResult, GitGateway } from "@sdl/core/git";
import { formatErrorMessage } from "@sdl/core/primitives";
import type { HandoffStorageDeps } from "@sdl/handoff/api";

import { isRecord } from "../runtime/primitives.ts";
import type { ExtensionAPI } from "./runtime-types.ts";

const BRMEM_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
const FIXED_UNKNOWN_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export function createPiHandoffStorageDeps(pi: ExtensionAPI, cwd: string): HandoffStorageDeps {
	return {
		brmem: new PiBrmemGateway(pi, cwd),
		git: new PiGitBranchPresenceGateway(pi),
		cwd,
	};
}

class PiBrmemGateway implements Pick<
	BrmemGateway,
	"listEntries" | "getEntry" | "checkEntry" | "putEntry" | "deleteEntry"
> {
	private readonly pi: ExtensionAPI;
	private readonly cwd: string;

	constructor(pi: ExtensionAPI, cwd: string) {
		this.pi = pi;
		this.cwd = cwd;
	}

	async listEntries(options: {
		namespace: string;
		key?: string | undefined;
		branch?: string | undefined;
	}): Promise<BrmemResult<readonly ListedEntry[]>> {
		const commandArgs = [
			"list",
			"--namespace",
			options.namespace,
			...(options.key === undefined ? [] : ["--key", options.key]),
			...(options.branch === undefined ? ["--all-branches"] : ["--branch", options.branch]),
			"--format",
			"json",
		];
		const run = await runPiCommand(this.pi, "brmem", commandArgs, {
			cwd: this.cwd,
			timeout: BRMEM_TIMEOUT_MS,
		});
		if (run.type === "failed") {
			return brmemError(run.error.code, run.error.message, run.error.displayCommand);
		}

		try {
			return brmemOk(parseBrmemListEntries(run.result.stdout, options));
		} catch (error) {
			return brmemError(
				"brmem_malformed_list",
				formatErrorMessage(error),
				formatCommand("brmem", commandArgs),
			);
		}
	}

	async getEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string | undefined;
	}) {
		const commandArgs = [
			"get",
			options.key,
			"--namespace",
			options.namespace,
			"--branch",
			options.branch,
			...(options.at === undefined ? [] : ["--at", options.at]),
		];
		const run = await runPiCommand(this.pi, "brmem", commandArgs, {
			cwd: this.cwd,
			timeout: BRMEM_TIMEOUT_MS,
		});
		if (run.type === "failed") {
			return brmemOptionalError<EntryContent>(
				run.error.code,
				run.error.message,
				run.error.displayCommand,
			);
		}
		return brmemFound({ content: run.result.stdout });
	}

	async checkEntry(options: {
		namespace: string;
		key: string;
		branch: string;
		at?: string | undefined;
	}) {
		const result = await checkBrmemEntry({
			gateway: this.pi,
			cwd: this.cwd,
			key: options.key,
			namespace: options.namespace,
			branch: options.branch,
			timeoutMs: BRMEM_TIMEOUT_MS,
		});
		switch (result.type) {
			case "present":
				return brmemFound<EntryDiagnostic>({
					headSha: "",
					headDate: "",
					blobSha: "",
					sizeBytes: 0,
				});
			case "absent":
				return brmemMissing<EntryDiagnostic>();
			case "error":
				return brmemOptionalError<EntryDiagnostic>(
					result.error.code,
					result.error.message,
					result.error.displayCommand,
				);
		}
	}

	async putEntry(_options: {
		namespace: string;
		key: string;
		branch: string;
		content: string;
	}): Promise<BrmemResult<PutEntryResult>> {
		return brmemError(
			"unsupported_pi_handoff_write",
			"Pi handoff storage adapter does not write Branch Memory entries; use `sdl handoff create --slug <slug> --branch <branch> --file /dev/stdin` for creation.",
		);
	}

	async deleteEntry(_options: {
		namespace: string;
		key: string;
		branch: string;
	}): Promise<BrmemResult<DeleteEntryResult>> {
		return brmemError(
			"unsupported_pi_handoff_delete",
			"Pi handoff storage adapter does not delete Branch Memory entries.",
		);
	}
}

class PiGitBranchPresenceGateway implements Pick<GitGateway, "localBranchPresence"> {
	private readonly pi: ExtensionAPI;

	constructor(pi: ExtensionAPI) {
		this.pi = pi;
	}

	async localBranchPresence(params: {
		cwd: string;
		branch: string;
		env?: NodeJS.ProcessEnv | undefined;
		signal?: AbortSignal | undefined;
	}): Promise<GitBranchPresenceResult> {
		const refName = `refs/heads/${params.branch}`;
		const commandArgs = ["rev-parse", "--verify", refName];
		let result: ExecResult;
		try {
			result = await this.pi.exec("git", commandArgs, {
				cwd: params.cwd,
				timeout: GIT_TIMEOUT_MS,
				...(params.signal === undefined ? {} : { signal: params.signal }),
			});
		} catch (error) {
			const displayCommand = formatCommand("git", commandArgs);
			return {
				type: "error",
				error: {
					code: "branch_presence_startup_failed",
					message: formatCommandStartupFailure("command failed", displayCommand, error),
					displayCommand,
				},
			};
		}

		if (result.code === 0 && !result.killed) {
			return { type: "present", refName, displayCommand: formatCommand("git", commandArgs) };
		}
		if (!result.killed && (result.code === 1 || isMissingRevisionResult(result))) {
			return { type: "absent", refName };
		}
		const displayCommand = formatCommand("git", commandArgs);
		return {
			type: "error",
			error: {
				code: result.killed ? "branch_presence_killed" : "branch_presence_failed",
				message: formatCommandFailure("command failed", displayCommand, result),
				displayCommand,
			},
		};
	}
}

async function runPiCommand(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	options: { cwd: string; timeout: number },
): Promise<{ type: "ok"; result: ExecResult } | { type: "failed"; error: BrmemErrorInfo }> {
	let result: ExecResult;
	try {
		result = await pi.exec(command, args, { cwd: options.cwd, timeout: options.timeout });
	} catch (error) {
		return {
			type: "failed",
			error: {
				code: `${command}_startup_failed`,
				message: formatCommandStartupFailure("command failed", formatCommand(command, args), error),
				displayCommand: formatCommand(command, args),
			},
		};
	}
	if (result.code !== 0 || result.killed) {
		return {
			type: "failed",
			error: {
				code: `${command}_failed`,
				message: formatCommandFailure("command failed", formatCommand(command, args), result),
				displayCommand: formatCommand(command, args),
			},
		};
	}
	return { type: "ok", result };
}

function parseBrmemListEntries(
	stdout: string,
	expected: { namespace: string; key?: string | undefined; branch?: string | undefined },
): readonly ListedEntry[] {
	const parsed: unknown = JSON.parse(stdout);
	const data = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
	if (!isRecord(data) || !Array.isArray(data.entries)) {
		throw new Error("brmem list JSON did not contain data.entries array.");
	}
	return data.entries.map((entry, index) => parseBrmemListEntry(entry, index, expected));
}

function parseBrmemListEntry(
	entry: unknown,
	index: number,
	expected: { namespace: string; key?: string | undefined; branch?: string | undefined },
): ListedEntry {
	if (!isRecord(entry)) {
		throw new Error(`brmem list JSON data.entries[${index}] was not an object.`);
	}
	const namespace = stringField(entry, "namespace", index);
	const key = stringField(entry, "key", index);
	const branch = stringField(entry, "branch", index);
	if (namespace !== expected.namespace) {
		throw new Error(`brmem list JSON data.entries[${index}].namespace did not match handoff.`);
	}
	if (expected.key !== undefined && key !== expected.key) {
		throw new Error(`brmem list JSON data.entries[${index}].key did not match ${expected.key}.`);
	}
	if (expected.branch !== undefined && branch !== expected.branch) {
		throw new Error(
			`brmem list JSON data.entries[${index}].branch did not match ${expected.branch}.`,
		);
	}
	const locator =
		optionalStringField(entry, "ref_name") ??
		optionalStringField(entry, "entry_locator") ??
		mustEntryLocator(namespace, key, branch);
	const updatedAt =
		optionalStringField(entry, "updated_at") ??
		optionalStringField(entry, "updatedAt") ??
		FIXED_UNKNOWN_UPDATED_AT;
	return { namespace, key, branch, entryLocator: locator, updatedAt };
}

function stringField(entry: Record<string, unknown>, field: string, index: number): string {
	const value = entry[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`brmem list JSON data.entries[${index}].${field} was not a non-empty string.`);
	}
	return value;
}

function optionalStringField(entry: Record<string, unknown>, field: string): string | undefined {
	const value = entry[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isMissingRevisionResult(result: ExecResult): boolean {
	const text = `${result.stderr}\n${result.stdout}`;
	return /unknown revision|Needed a single revision|bad revision|ambiguous argument/.test(text);
}

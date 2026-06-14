import { failure, ok, type ClinkrExecutionInfo } from "@asdl/clinkr";
import { posix } from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";

import { checkEntryNotBinary, checkEntrySize } from "../content-limits.ts";
import type { BrmemCliContext } from "../context.ts";
import { mustEntryLocator, namespaceDisplayLabel, normalizeNamespaceOption } from "../ref-layout.ts";
import { firstFailure, validateBranchName, validateEntryKey, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure, resolveCurrentBranch } from "./shared.ts";

const STDIN_SOURCE_FILE = "<stdin>";

export const putRequestSchema = z.object({
	key: z.string().describe("Entry Key."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	stdin: z.boolean().default(false).describe("Read content from stdin."),
	file: z.string().optional().describe("Read content from file."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	force: z.boolean().default(false).describe("Bypass the 1 MiB size cap and binary-content check."),
});

export const putResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	ref_name: z.string(),
	commit: z.string(),
	source_file: z.string(),
});

export type PutRequest = z.infer<typeof putRequestSchema>;
export type PutResult = z.infer<typeof putResultSchema>;

export async function runPut(ctx: BrmemCliContext, request: PutRequest, info: ClinkrExecutionInfo) {
	if (request.stdin && info.format === "json") {
		return failure(
			"stdin_unsupported_in_json_mode",
			"brmem put --stdin is only supported in the human CLI; JSON mode already uses stdin for the request body.",
		);
	}
	if (request.stdin && request.file !== undefined) {
		return failure("stdin_and_file_conflict", "--stdin and --file are mutually exclusive.");
	}

	const source = await readSourceBytes(ctx, request);
	if (source.type === "failure") return source.failure;

	if (!request.force) {
		const sizeMessage = checkEntrySize(source.bytes);
		if (sizeMessage !== undefined) {
			return failure("entry_too_large", `${source.sourceFile} ${sizeMessage}. Pass -f / --force to override.`);
		}
		const binaryMessage = checkEntryNotBinary(source.bytes);
		if (binaryMessage !== undefined) {
			return failure("entry_appears_binary", `${source.sourceFile} ${binaryMessage}. Pass -f / --force to override.`);
		}
	}

	const decoded = decodeUtf8(source.bytes, source.sourceFile);
	if (decoded.type === "failure") return decoded.failure;

	const resolvedBranch = request.branch ?? (await resolveCurrentBranch(ctx));
	if (typeof resolvedBranch !== "string") return resolvedBranch;
	const namespace = normalizeNamespaceOption(request.namespace);
	const validationFailure = firstFailure(
		["invalid_namespace", validationMessage("namespace", namespace, validateNamespaceName(namespace))],
		["invalid_key", validationMessage("key", request.key, validateEntryKey(request.key))],
		["invalid_branch_name", validationMessage("branch name", resolvedBranch, validateBranchName(resolvedBranch))],
	);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);

	const result = await ctx.gateway.putEntry({
		namespace,
		key: request.key,
		branch: resolvedBranch,
		content: decoded.content,
	});
	if (result.type === "error") return gatewayFailure<PutResult>(result.error);

	return ok({
		namespace,
		key: request.key,
		branch: resolvedBranch,
		ref_name: mustEntryLocator(namespace, request.key, resolvedBranch),
		commit: result.value.commitSha,
		source_file: source.sourceFile,
	});
}

export function renderPut(result: PutResult): string {
	const source = result.source_file === STDIN_SOURCE_FILE ? "stdin" : result.source_file;
	return [
		`Stored Entry Key ${result.key} from ${source} in ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
		`Entry Locator: ${result.ref_name}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.ref_name}`,
	].join("\n");
}

type SourceReadResult =
	| { type: "ok"; sourceFile: string; bytes: Uint8Array }
	| { type: "failure"; failure: ReturnType<typeof failure> };

async function readSourceBytes(ctx: BrmemCliContext, request: PutRequest): Promise<SourceReadResult> {
	if (request.stdin) return { type: "ok", sourceFile: STDIN_SOURCE_FILE, bytes: await ctx.sourceReader.readStdinBytes() };
	const sourceFile = request.file ?? defaultSourceFromKey(request.key);
	if (sourceFile === undefined) {
		return {
			type: "failure",
			failure: failure(
				"source_file_missing",
				`Cannot infer a default --file for Entry Key ${JSON.stringify(request.key)}; provide --file or --stdin.`,
			),
		};
	}
	const source = await ctx.sourceReader.readFileBytes(sourceFile, { cwd: ctx.cwd });
	if (source.type === "ok") return { type: "ok", sourceFile, bytes: source.bytes };
	if (source.type === "missing") {
		return { type: "failure", failure: failure("source_file_missing", `Source file not found: ${sourceFile}`) };
	}
	return {
		type: "failure",
		failure: failure("source_file_unreadable", `Failed to read source file ${sourceFile}: ${source.message}`),
	};
}

function defaultSourceFromKey(key: string): string | undefined {
	const normalized = posix.normalize(key);
	if (normalized === "." || normalized === "/") return undefined;
	const basename = posix.basename(normalized);
	return basename.length === 0 ? undefined : basename;
}

type DecodeResult = { type: "ok"; content: string } | { type: "failure"; failure: ReturnType<typeof failure> };

function decodeUtf8(bytes: Uint8Array, sourceFile: string): DecodeResult {
	try {
		return { type: "ok", content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
	} catch (error) {
		return { type: "failure", failure: failure("entry_not_utf8", `${sourceFile} is not valid UTF-8: ${messageForError(error)}`) };
	}
}

function messageForError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

import { posix } from "node:path";
import { TextDecoder } from "node:util";

import { optionalEntry } from "@nseng-ai/core/primitives";

import { checkEntryNotBinary, checkEntrySize } from "./content-limits.ts";
import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";
import type { BrmemGateway } from "./gateway.ts";
import { mustEntryLocator } from "./ref-layout.ts";
import { NodeBrmemSourceReader, type BrmemSourceReader } from "./source-reader.ts";

export const STDIN_SOURCE_FILE = "<stdin>";

export interface PrepareEntryContentSourceOptions {
	cwd: string;
	key: string;
	stdin?: boolean;
	file?: string;
	force?: boolean;
	sourceReader: BrmemSourceReader;
}

export interface PreparedEntryContent {
	content: string;
	sourceFile: string;
}

export interface PutEntryFromFileOptions {
	gateway: BrmemGateway;
	cwd: string;
	namespace: string;
	key: string;
	branch: string;
	sourceFile: string;
	sourceReader?: BrmemSourceReader;
	force?: boolean;
}

export interface PutEntryFromFileResult {
	namespace: string;
	key: string;
	branch: string;
	entryLocator: string;
	commitSha: string;
	sourceFile: string;
}

export async function prepareEntryContentFromSource(
	options: PrepareEntryContentSourceOptions,
): Promise<BrmemResult<PreparedEntryContent>> {
	if (options.stdin === true && options.file !== undefined) {
		return brmemError("stdin-and-file-conflict", "--stdin and --file are mutually exclusive.");
	}

	const source = await readSourceBytes(options);
	if (source.type === "error") return source.error;

	if (options.force !== true) {
		const sizeMessage = checkEntrySize(source.bytes);
		if (sizeMessage !== undefined) {
			return brmemError(
				"entry-too-large",
				`${source.sourceFile} ${sizeMessage}. Pass -f / --force to override.`,
			);
		}
		const binaryMessage = checkEntryNotBinary(source.bytes);
		if (binaryMessage !== undefined) {
			return brmemError(
				"entry-appears-binary",
				`${source.sourceFile} ${binaryMessage}. Pass -f / --force to override.`,
			);
		}
	}

	const decoded = decodeUtf8(source.bytes, source.sourceFile);
	if (decoded.type === "error") return decoded.error;

	return brmemOk({ content: decoded.content, sourceFile: source.sourceFile });
}

export async function putEntryFromFile(
	options: PutEntryFromFileOptions,
): Promise<BrmemResult<PutEntryFromFileResult>> {
	const prepared = await prepareEntryContentFromSource({
		cwd: options.cwd,
		key: options.key,
		file: options.sourceFile,
		...optionalEntry("force", options.force),
		sourceReader: options.sourceReader ?? new NodeBrmemSourceReader(),
	});
	if (prepared.type === "error") return prepared;

	const put = await options.gateway.putEntry({
		namespace: options.namespace,
		key: options.key,
		branch: options.branch,
		content: prepared.value.content,
	});
	if (put.type === "error") return put;

	return brmemOk({
		namespace: options.namespace,
		key: options.key,
		branch: options.branch,
		entryLocator: mustEntryLocator(options.namespace, options.key, options.branch),
		commitSha: put.value.commitSha,
		sourceFile: prepared.value.sourceFile,
	});
}

type SourceReadResult =
	| { type: "ok"; sourceFile: string; bytes: Uint8Array }
	| { type: "error"; error: BrmemResult<never> };

async function readSourceBytes(
	options: PrepareEntryContentSourceOptions,
): Promise<SourceReadResult> {
	if (options.stdin === true) {
		return {
			type: "ok",
			sourceFile: STDIN_SOURCE_FILE,
			bytes: await options.sourceReader.readStdinBytes(),
		};
	}
	const sourceFile = options.file ?? defaultSourceFromKey(options.key);
	if (sourceFile === undefined) {
		return {
			type: "error",
			error: brmemError(
				"source-file-missing",
				`Cannot infer a default --file for Entry Key ${JSON.stringify(options.key)}; provide --file or --stdin.`,
			),
		};
	}
	const source = await options.sourceReader.readFileBytes(sourceFile, { cwd: options.cwd });
	if (source.type === "ok") return { type: "ok", sourceFile, bytes: source.bytes };
	if (source.type === "missing") {
		return {
			type: "error",
			error: brmemError("source-file-missing", `Source file not found: ${sourceFile}`),
		};
	}
	return {
		type: "error",
		error: brmemError(
			"source-file-unreadable",
			`Failed to read source file ${sourceFile}: ${source.message}`,
		),
	};
}

function defaultSourceFromKey(key: string): string | undefined {
	const normalized = posix.normalize(key);
	if (normalized === "." || normalized === "/") return undefined;
	const basename = posix.basename(normalized);
	return basename.length === 0 ? undefined : basename;
}

type DecodeResult = { type: "ok"; content: string } | { type: "error"; error: BrmemResult<never> };

function decodeUtf8(bytes: Uint8Array, sourceFile: string): DecodeResult {
	try {
		return { type: "ok", content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
	} catch (error) {
		return {
			type: "error",
			error: brmemError(
				"entry-not-utf8",
				`${sourceFile} is not valid UTF-8: ${messageForError(error)}`,
			),
		};
	}
}

function messageForError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

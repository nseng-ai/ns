import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";

export type SourceBytesResult =
	| { type: "ok"; bytes: Uint8Array }
	| { type: "missing" }
	| { type: "unreadable"; message: string };

export interface BrmemSourceReader {
	readFileBytes(path: string, options: { cwd: string }): Promise<SourceBytesResult>;
	readStdinBytes(): Promise<Uint8Array>;
}

export class NodeBrmemSourceReader implements BrmemSourceReader {
	async readFileBytes(path: string, options: { cwd: string }): Promise<SourceBytesResult> {
		const sourcePath = isAbsolute(path) ? path : resolve(options.cwd, path);
		try {
			return { type: "ok", bytes: await readFile(sourcePath) };
		} catch (error) {
			if (isNodeErrorWithCode(error, "ENOENT")) return { type: "missing" };
			return { type: "unreadable", message: messageForError(error) };
		}
	}

	async readStdinBytes(): Promise<Uint8Array> {
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

function messageForError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

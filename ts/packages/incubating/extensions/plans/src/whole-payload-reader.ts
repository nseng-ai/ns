import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";

export interface WholePayloadReader {
	readFile(path: string, options: { cwd: string }): Promise<string>;
	readStdin(): Promise<string>;
}

export class NodeWholePayloadReader implements WholePayloadReader {
	async readFile(path: string, options: { cwd: string }): Promise<string> {
		return await readFile(isAbsolute(path) ? path : resolve(options.cwd, path), "utf8");
	}

	async readStdin(): Promise<string> {
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
		return Buffer.concat(chunks).toString("utf8");
	}
}

import process from "node:process";
import { createInterface } from "node:readline";

/**
 * Read all of `process.stdin` into a UTF-8 string, resolving at EOF.
 *
 * Shared by CLI entrypoints that accept piped content; prefer this over
 * re-implementing the stdin drain loop per package.
 */
export async function readStdin(): Promise<string> {
	let content = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		content += chunk;
	}
	return content;
}

/** Read one line from stdin, resolving as soon as the line is submitted. */
export async function readStdinLine(
	input: NodeJS.ReadableStream = process.stdin,
): Promise<string | null> {
	const lines = createInterface({ input, crlfDelay: Infinity });
	try {
		for await (const line of lines) return line;
		return null;
	} finally {
		lines.close();
	}
}

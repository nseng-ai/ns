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

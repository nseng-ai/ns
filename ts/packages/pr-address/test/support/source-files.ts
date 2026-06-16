import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function sourceFilesUnder(root: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = resolve(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await sourceFilesUnder(entryPath)));
		} else if (entry.isFile() && entryPath.endsWith(".ts")) {
			files.push(entryPath);
		}
	}

	return files.sort();
}

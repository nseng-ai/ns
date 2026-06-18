import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TemporaryFileOptions {
	readonly prefix: string;
	readonly filename: string;
	readonly contents: string;
}

export interface TemporaryJsonFileOptions {
	readonly prefix: string;
	readonly filename?: string | undefined;
	readonly value: unknown;
}

export async function withTemporaryFile<T>(
	options: TemporaryFileOptions,
	callback: (path: string) => Promise<T>,
): Promise<T> {
	const directory = await mkdtemp(join(tmpdir(), options.prefix));
	try {
		const path = join(directory, options.filename);
		await writeFile(path, options.contents, "utf8");
		return await callback(path);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export async function withTemporaryJsonFile<T>(
	options: TemporaryJsonFileOptions,
	callback: (path: string) => Promise<T>,
): Promise<T> {
	return await withTemporaryFile(
		{
			prefix: options.prefix,
			filename: options.filename ?? "input.json",
			contents: JSON.stringify(options.value),
		},
		callback,
	);
}

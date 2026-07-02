import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PromptFileOptions {
	promptDir?: string;
	now?: () => number;
}

export interface ResolvedPromptFileOptions {
	promptDir: string;
	now: () => number;
}

export function resolvePromptFileOptions(
	options: PromptFileOptions,
	defaultPromptDir: string,
): ResolvedPromptFileOptions {
	return {
		promptDir: options.promptDir ?? defaultPromptDir,
		now: options.now ?? Date.now,
	};
}

export async function writeTimestampedPromptFile(options: {
	promptDir: string;
	now: () => number;
	stem: string;
	content: string;
}): Promise<string> {
	await mkdir(options.promptDir, { recursive: true });
	const path = join(options.promptDir, `${options.now()}-${options.stem}.md`);
	await writeFile(path, options.content, "utf8");
	return path;
}

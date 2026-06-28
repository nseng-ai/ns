import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

/**
 * Register a per-file temp-dir factory. Every directory it creates is
 * removed after each test. Call once at module scope of a test file.
 */
export function useTempDirs(): (prefix: string) => Promise<string> {
	const dirs: string[] = [];
	afterEach(async () => {
		const pending = dirs.splice(0);
		await Promise.all(pending.map((dir) => rm(dir, { recursive: true, force: true })));
	});
	return async (prefix: string) => {
		const dir = await mkdtemp(join(tmpdir(), prefix));
		dirs.push(dir);
		return dir;
	};
}

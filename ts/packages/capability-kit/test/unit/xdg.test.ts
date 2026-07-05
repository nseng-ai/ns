import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	ensurePrivateDirectory,
	ensurePrivateDirectorySync,
	ensurePrivateParentDirectory,
	ensurePrivateParentDirectorySync,
	resolveNsXdgPath,
} from "@nseng-ai/capability-kit/xdg";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("XDG capability-kit helpers", () => {
	test("exports pure XDG path helpers from the lower-tier core subpath", () => {
		expect(
			resolveNsXdgPath({
				kind: "data",
				env: { HOME: "/home/tester" },
				segments: ["extensions"],
			}),
		).toEqual({ ok: true, value: "/home/tester/.local/share/ns/extensions" });
	});

	test("private directory creation uses 0700 for new directories and leaves existing permissions", async () => {
		const root = await makeTempDir();
		const created = join(root, "created");
		await ensurePrivateDirectory(created);
		expect(mode(await stat(created))).toBe(0o700);

		const existing = join(root, "existing");
		await ensurePrivateDirectory(existing);
		await chmod(existing, 0o755);
		await ensurePrivateParentDirectory(join(existing, "child", "file.txt"));
		expect(mode(await stat(existing))).toBe(0o755);
		expect(mode(await stat(join(existing, "child")))).toBe(0o700);
	});

	test("sync private directory creation matches async permission semantics", async () => {
		const root = await makeTempDir();
		const created = join(root, "sync-created");
		ensurePrivateDirectorySync(created);
		expect(mode(await stat(created))).toBe(0o700);

		ensurePrivateParentDirectorySync(join(root, "sync-parent", "file.txt"));
		expect(mode(await stat(join(root, "sync-parent")))).toBe(0o700);
	});
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ns-capability-kit-xdg-"));
	tempDirs.push(dir);
	return dir;
}

function mode(stats: { mode: number }): number {
	return stats.mode & 0o777;
}

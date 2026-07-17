import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { RealPublicationAuthorizationStore } from "../../src/publication/authorization-store.ts";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ns-objective-publication-store-"));
	roots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("real publication authorization store", () => {
	test("binds 0600 without clobber and atomically replaces through the caller-owned parent", async () => {
		const root = await tempRoot();
		const repoRoot = join(root, "repo");
		const scratch = join(root, "scratch");
		await mkdir(repoRoot);
		await mkdir(scratch);
		const path = join(scratch, "authorization.json");
		const store = new RealPublicationAuthorizationStore({ repoRoot });

		expect(await store.bind(path, "first")).toEqual({ ok: true, value: undefined });
		expect((await lstat(path)).mode & 0o777).toBe(0o600);
		expect(await store.bind(path, "clobber")).toMatchObject({
			ok: false,
			error: { code: "authorization-already-exists" },
		});
		expect(await readFile(path, "utf8")).toBe("first");

		expect(await store.replace(path, "second")).toEqual({ ok: true, value: undefined });
		expect(await readFile(path, "utf8")).toBe("second");
		expect((await lstat(path)).mode & 0o777).toBe(0o600);
		await expect((await import("node:fs/promises")).readdir(scratch)).resolves.toEqual([
			"authorization.json",
		]);
	});

	test("refuses repository paths, symlinks, unexpected types, and widened modes", async () => {
		const root = await tempRoot();
		const repoRoot = join(root, "repo");
		const scratch = join(root, "scratch");
		await mkdir(repoRoot);
		await mkdir(scratch);
		const store = new RealPublicationAuthorizationStore({ repoRoot });

		expect(await store.bind(join(repoRoot, "authorization.json"), "no")).toMatchObject({
			ok: false,
			error: { code: "authorization-path-inside-repository" },
		});

		const target = join(scratch, "target.json");
		const linked = join(scratch, "linked.json");
		await writeFile(target, "target", { mode: 0o600 });
		await symlink(target, linked);
		expect(await store.read(linked)).toMatchObject({
			ok: false,
			error: { code: "authorization-file-invalid" },
		});

		await chmod(target, 0o640);
		expect(await store.read(target)).toMatchObject({
			ok: false,
			error: { code: "authorization-mode-invalid" },
		});

		const directoryPath = join(scratch, "directory.json");
		await mkdir(directoryPath);
		expect(await store.read(directoryPath)).toMatchObject({
			ok: false,
			error: { code: "authorization-file-invalid" },
		});
	});

	test("refuses a symlink parent", async () => {
		const root = await tempRoot();
		const repoRoot = join(root, "repo");
		const scratch = join(root, "scratch");
		const linkedParent = join(root, "linked-scratch");
		await mkdir(repoRoot);
		await mkdir(scratch);
		await symlink(scratch, linkedParent);
		const store = new RealPublicationAuthorizationStore({ repoRoot });

		expect(await store.bind(join(linkedParent, "authorization.json"), "no")).toMatchObject({
			ok: false,
			error: { code: "authorization-parent-invalid" },
		});
	});
});

import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RealVercelProjectConfigStore } from "asdl-dev/src/gateways/project-config.ts";

const tempDirs: string[] = [];

afterEach(() => {
	const dirs = tempDirs.splice(0);
	for (const dir of dirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function tempRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "asdl-dev-project-config-"));
	tempDirs.push(root);
	return root;
}

function writeProjectConfig(repoRoot: string, content: string): void {
	mkdirSync(join(repoRoot, ".vercel"));
	writeFileSync(join(repoRoot, ".vercel", "project.json"), content, "utf8");
}

describe("RealVercelProjectConfigStore", () => {
	test("returns missing when .vercel/project.json does not exist", async () => {
		const store = new RealVercelProjectConfigStore();

		expect(await store.readProjectConfig({ repoRoot: tempRepo() })).toEqual({ kind: "missing" });
	});

	test("returns found for a nonblank projectName", async () => {
		const repoRoot = tempRepo();
		writeProjectConfig(repoRoot, JSON.stringify({ projectName: "custom-project" }));
		const store = new RealVercelProjectConfigStore();

		expect(await store.readProjectConfig({ repoRoot })).toEqual({ kind: "found", projectName: "custom-project" });
	});

	test("returns invalid for missing or blank projectName", async () => {
		const missing = tempRepo();
		writeProjectConfig(missing, JSON.stringify({ projectId: "prj_123" }));
		const blank = tempRepo();
		writeProjectConfig(blank, JSON.stringify({ projectName: "  " }));
		const store = new RealVercelProjectConfigStore();

		expect(await store.readProjectConfig({ repoRoot: missing })).toEqual({ kind: "invalid" });
		expect(await store.readProjectConfig({ repoRoot: blank })).toEqual({ kind: "invalid" });
	});

	test("returns invalid for malformed JSON", async () => {
		const repoRoot = tempRepo();
		writeProjectConfig(repoRoot, "not json");
		const store = new RealVercelProjectConfigStore();

		expect(await store.readProjectConfig({ repoRoot })).toEqual({ kind: "invalid" });
	});

	test("returns read_error for non-ENOENT read failures", async () => {
		const store = new RealVercelProjectConfigStore(async () => {
			const error = new Error("permission denied") as Error & { code: string };
			error.code = "EACCES";
			throw error;
		});

		expect(await store.readProjectConfig({ repoRoot: "/repo" })).toEqual({ kind: "read_error", message: "permission denied" });
	});
});
